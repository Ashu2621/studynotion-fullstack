// End-to-end API test for the StudyNotion server. Run with:  npm test
// It boots an in-memory MongoDB, a local SMTP sink and the real Express app, then drives every
// endpoint with fetch(). Cloudinary uploads and Razorpay order creation are stubbed (see stubs.js)
// so no paid service or account is needed.
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { SMTPServer } = require("smtp-server");

const SERVER = path.resolve(__dirname, "..");
const LABEL = "api";
const PORT = 4100;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const SECRET = "secret123";
const fromServer = (m) => require(require.resolve(m, { paths: [SERVER] }));
const mongoose = fromServer("mongoose");

const results = [];
const mails = [];
let serverLog = "";
let child;

function rec(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}
async function call(method, url, { token, json, form, timeout = 8000 } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(BASE + url, { method, headers, body, signal: ctl.signal });
    let data = null; const txt = await r.text();
    try { data = JSON.parse(txt); } catch { data = txt; }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: String(e.name === "AbortError" ? "TIMEOUT (no response)" : e.message) };
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fileForm(fields, files) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [k, name] of Object.entries(files || {})) f.append(k, new Blob([Buffer.from("fake-bytes-" + name)]), name);
  return f;
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("studynotion_test");
  const smtp = new SMTPServer({
    authOptional: true, allowInsecureAuth: true, disabledCommands: ["STARTTLS"],
    onAuth: (a, s, cb) => cb(null, { user: 1 }),
    onData(stream, s, cb) { let b = ""; stream.on("data", (c) => (b += c)); stream.on("end", () => { mails.push(b); cb(); }); },
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  const smtpPort = smtp.server.address().port;

  child = spawn(process.execPath, ["index.js"], {
    cwd: SERVER,
    env: {
      ...process.env, PORT: String(PORT), MONGODB_URL: uri, JWT_SECRET: "jwt-test-secret",
      MAIL_HOST: "127.0.0.1", MAIL_PORT: String(smtpPort), MAIL_USER: "noreply@studynotion.test", MAIL_PASS: "x",
      CLOUD_NAME: "x", API_KEY: "x", API_SECRET: "x", FOLDER_NAME: "StudyNotion",
      RAZORPAY_KEY: "rzp_test_x", RAZORPAY_SECRET: SECRET,
      SERVER_DIR: SERVER, NODE_OPTIONS: "--require " + path.join(__dirname, "stubs.js"),
      FRONTEND_URL: "https://studynotion.example.app", NODE_ENV: "test",
    },
  });
  child.stdout.on("data", (d) => (serverLog += d));
  child.stderr.on("data", (d) => (serverLog += d));
  let exited = false; child.on("exit", () => (exited = true));
  for (let i = 0; i < 100 && !/DB connection successfull/.test(serverLog); i++) await sleep(150);
  if (!/DB connection successfull/.test(serverLog)) { console.log("SERVER DID NOT START\n" + serverLog.slice(-1500)); process.exit(2); }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  await sleep(3500); // let uptime pass so OTP createdAt bugs show

  const latestOtp = async (email) => (await db.collection("otps").find({ email }).sort({ createdAt: -1, _id: -1 }).limit(1).toArray())[0];
  async function register(email, accountType, pwd = "Passw0rd!") {
    const s = await call("POST", "/auth/sendotp", { json: { email } });
    const o = await latestOtp(email);
    const r = await call("POST", "/auth/signup", { json: { firstName: "T", lastName: accountType, email, password: pwd, confirmPassword: pwd, accountType, otp: o && o.otp, contactNumber: "9999999999" } });
    return { s, r };
  }
  async function login(email, pwd = "Passw0rd!") { return call("POST", "/auth/login", { json: { email, password: pwd } }); }

  // ---------------- AUTH ----------------
  const so = await call("POST", "/auth/sendotp", { json: { email: "stu@test.dev" } });
  rec("sendotp returns 200", so.status === 200, `status ${so.status}`);
  rec("sendotp does not leak the OTP in the response", !JSON.stringify(so.data).match(/"otp"/), JSON.stringify(so.data).slice(0, 90));
  rec("OTP email is actually delivered", mails.some((m) => /stu@test\.dev/.test(m)), `${mails.length} mail(s)`);
  const o1 = await latestOtp("stu@test.dev");
  rec("OTP createdAt is the time of creation (needed for 5-min expiry)", o1 && Math.abs(Date.now() - new Date(o1.createdAt)) < 2500, o1 ? `off by ${Math.round((Date.now() - new Date(o1.createdAt)) / 1000)}s` : "no otp");
  await call("POST", "/auth/sendotp", { json: { email: "stu@test.dev" } }); // second OTP for same email
  const o2 = await latestOtp("stu@test.dev");
  const wrongOtp = await call("POST", "/auth/signup", { json: { firstName: "T", lastName: "S", email: "stu@test.dev", password: "Passw0rd!", confirmPassword: "Passw0rd!", accountType: "Student", otp: "000000" } });
  rec("signup rejects a wrong OTP", wrongOtp.status === 400, `status ${wrongOtp.status}`);
  const reg = await call("POST", "/auth/signup", { json: { firstName: "Stu", lastName: "Dent", email: "stu@test.dev", password: "Passw0rd!", confirmPassword: "Passw0rd!", accountType: "Student", otp: o2.otp, contactNumber: "9999999999" } });
  rec("signup works with the LATEST OTP (second request)", reg.status === 200, `status ${reg.status} ${reg.data && reg.data.message}`);
  rec("signup response does not contain the password hash", !(reg.data && reg.data.user && reg.data.user.password), "");
  const dup = await register("stu@test.dev", "Student");
  rec("duplicate email is rejected", dup.s.status === 401, `status ${dup.s.status}`);
  const adm = await register("evil@test.dev", "Admin");
  rec("public signup cannot create an Admin account", adm.r.status !== 200, `status ${adm.r.status}`);
  await db.collection("users").insertOne({ firstName: "A", lastName: "Dmin", email: "admin@test.dev", password: await fromServer("bcrypt").hash("Passw0rd!", 10), accountType: "Admin", approved: true, image: "x", courses: [], courseProgress: [], additionalDetails: new mongoose.Types.ObjectId() });
  const ins = await register("ins@test.dev", "Instructor");
  const ins2 = await register("ins2@test.dev", "Instructor");
  const lStu = await login("stu@test.dev"); const lIns = await login("ins@test.dev"); const lIns2 = await login("ins2@test.dev"); const lAdm = await login("admin@test.dev");
  rec("login works (student, instructor, admin)", [lStu, lIns, lIns2, lAdm].every((x) => x.status === 200 && x.data.token), [lStu, lIns, lAdm].map((x) => x.status).join(","));
  rec("login rejects wrong password", (await login("stu@test.dev", "nope")).status === 401, "");
  rec("login rejects unknown user", (await login("ghost@test.dev")).status === 401, "");
  const T = { stu: lStu.data.token, ins: lIns.data.token, ins2: lIns2.data.token, adm: lAdm.data.token };
  const noTok = await call("GET", "/profile/getUserDetails");
  rec("protected route without token is 401", noTok.status === 401, `status ${noTok.status}`);

  mails.length = 0;
  const cp = await call("POST", "/auth/changepassword", { token: T.stu, json: { oldPassword: "Passw0rd!", newPassword: "NewPassw0rd!" } });
  rec("change password returns 200", cp.status === 200, `status ${cp.status} ${cp.data && cp.data.message}`);
  rec("password-changed email has a subject and a body", mails.some((m) => /Subject: .+/.test(m) && !/undefined/.test(m)), mails[0] ? (mails[0].match(/Subject: .*/) || ["no subject"])[0] : "no mail");
  rec("new password works for login", (await login("stu@test.dev", "NewPassw0rd!")).status === 200, "");
  await call("POST", "/auth/changepassword", { token: T.stu, json: { oldPassword: "NewPassw0rd!", newPassword: "Passw0rd!" } });

  mails.length = 0;
  const rt = await call("POST", "/auth/reset-password-token", { json: { email: "stu@test.dev" } });
  rec("reset-password-token returns 200", rt.status === 200, `status ${rt.status}`);
  const rawMail = mails.join("\n").replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  const m = rawMail.match(/https?:\/\/[^\s"<]*update-password\/([0-9a-f-]{36})/);
  rec("reset link points to the deployed front end, not localhost", !!m && !/localhost/.test(m[0]), m ? m[0] : "no link in mail");
  const tok = m ? m[1] : (await db.collection("users").findOne({ email: "stu@test.dev" })).token;
  const rp = await call("POST", "/auth/reset-password", { json: { token: tok, password: "Reset123!", confirmPassword: "Reset123!" } });
  rec("reset-password with the token works", rp.status === 200, `status ${rp.status}`);
  rec("login works with the reset password", (await login("stu@test.dev", "Reset123!")).status === 200, "");
  const rp2 = await call("POST", "/auth/reset-password", { json: { token: tok, password: "Hacked123!", confirmPassword: "Hacked123!" } });
  rec("reset token cannot be used a second time", !(rp2.status === 200 && rp2.data.success), `status ${rp2.status} success=${rp2.data && rp2.data.success}`);
  { let l = await login("stu@test.dev", "Reset123!"); if (l.status !== 200) l = await login("stu@test.dev", "Hacked123!"); T.stu = l.data.token; }

  // ---------------- PROFILE ----------------
  const ud = await call("GET", "/profile/getUserDetails", { token: T.stu });
  rec("getUserDetails works", ud.status === 200, `status ${ud.status}`);
  rec("getUserDetails does not expose the password hash", !(ud.data.userDetails && ud.data.userDetails.password), "");
  const up = await call("PUT", "/profile/updateProfile", { token: T.stu, json: { gender: "Male", contactNumber: "9876543210", about: "hi", dateOfBirth: "2000-01-01" } });
  rec("updateProfile works", up.status === 200 && up.data.updatedUserDetails.additionalDetails.about === "hi", `status ${up.status}`);
  const dp = await call("PUT", "/profile/updateDisplayPicture", { token: T.stu, form: fileForm({}, { displayPicture: "me.png" }) });
  rec("updateDisplayPicture works", dp.status === 200 && dp.data.success, `status ${dp.status} ${typeof dp.data === "string" ? dp.data.slice(0, 80) : dp.data.message}`);
  rec("updateDisplayPicture does not expose the password hash", !(dp.data && dp.data.data && dp.data.data.password), "");

  // ---------------- CATEGORIES ----------------
  const cat1 = await call("POST", "/course/createCategory", { token: T.adm, json: { name: "Web Dev", description: "Web" } });
  rec("admin can create a category", cat1.status === 200, `status ${cat1.status}`);
  rec("student cannot create a category", (await call("POST", "/course/createCategory", { token: T.stu, json: { name: "x", description: "y" } })).status === 401, "");
  const cats = await call("GET", "/course/showAllCategories");
  rec("showAllCategories works", cats.status === 200 && cats.data.data.length === 1, `status ${cats.status}`);
  const catId = cats.data.data[0]._id;

  // ---------------- COURSES ----------------
  const cf = (over = {}) => fileForm({ courseName: "Node 101", courseDescription: "Learn Node", whatWillYouLearn: "APIs", price: "499", category: catId, tags: JSON.stringify(["node"]), status: "Published", instructions: JSON.stringify(["laptop"]), ...over }, { thumbnailImage: "thumb.png" });
  rec("student cannot create a course", (await call("POST", "/course/createCourse", { token: T.stu, form: cf() })).status === 401, "");
  const cc = await call("POST", "/course/createCourse", { token: T.ins, form: cf() });
  rec("instructor can create a course", cc.status === 200 && cc.data.newCourse, `status ${cc.status} ${cc.data && cc.data.message}`);
  let courseId = cc.data.newCourse && cc.data.newCourse._id;
  const sec = await call("POST", "/course/addSection", { token: T.ins, json: { courseId, sectionName: "Intro" } });
  rec("addSection works", sec.status === 200, `status ${sec.status}`);
  let sectionId = sec.data.newSection && sec.data.newSection._id;
  const sub = await call("POST", "/course/addSubSection", { token: T.ins, form: fileForm({ sectionId, title: "Lecture 1", description: "first", timeDuration: "1" }, { video: "l1.mp4" }) });
  rec("addSubSection (video lecture) works", sub.status === 200, `status ${sub.status}`);
  let subId = sub.data.updatedSection && sub.data.updatedSection.subSection[0]._id;
  const usub = await call("POST", "/course/updateSubSection", { token: T.ins, json: { sectionId, subSectionId: subId, title: "Lecture 1 (edited)" } });
  rec("updateSubSection works", usub.status === 200, `status ${usub.status}`);
  const usec = await call("POST", "/course/updateSection", { token: T.ins, json: { sectionId, sectionName: "Intro v2", courseId } });
  rec("updateSection works", usec.status === 200, `status ${usec.status}`);

  const gd = await call("POST", "/course/getCourseDetails", { json: { courseId } });
  rec("getCourseDetails works and totals the duration", gd.status === 200 && gd.data.data.totalDuration, `status ${gd.status} ${gd.data.data && gd.data.data.totalDuration}`);
  const all = await call("GET", "/course/getAllCourses");
  rec("getAllCourses returns a list of courses", all.status === 200 && Array.isArray(all.data.data) && all.data.data.length === 1, `status ${all.status} data=${JSON.stringify(all.data.data).slice(0, 40)}`);
  const cpd = await call("POST", "/course/getCategoryPageDetails", { json: { categoryId: catId } });
  rec("category page works when only one category has courses", cpd.status === 200, `status ${cpd.status} ${cpd.data && (cpd.data.message || "")}`);
  const ic = await call("GET", "/course/getInstructorCourses", { token: T.ins });
  rec("getInstructorCourses works", ic.status === 200 && ic.data.data.length === 1, `status ${ic.status}`);
  const idash = await call("GET", "/profile/instructorDashboard", { token: T.ins });
  rec("instructorDashboard works", idash.status === 200 && idash.data.courses.length === 1, `status ${idash.status}`);

  const editOwn = await call("POST", "/course/editCourse", { token: T.ins, json: { courseId, courseName: "Node 101 (v2)" } });
  rec("owner can edit own course", editOwn.status === 200, `status ${editOwn.status}`);
  const editOther = await call("POST", "/course/editCourse", { token: T.ins2, json: { courseId, courseName: "pwned" } });
  rec("another instructor cannot edit this course", editOther.status === 403 || editOther.status === 401, `status ${editOther.status}`);
  const secOther = await call("POST", "/course/addSection", { token: T.ins2, json: { courseId, sectionName: "pwned" } });
  rec("another instructor cannot add a section to this course", secOther.status === 403 || secOther.status === 401, `status ${secOther.status}`);
  const delAnon = await call("DELETE", "/course/deleteCourse", { json: { courseId } });
  const stillThere = await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId) });
  rec("anonymous request cannot delete a course", !!stillThere && delAnon.status !== 200, `status ${delAnon.status}, course ${stillThere ? "still exists" : "DELETED"}`);
  if (!stillThere) { // rebuild so the remaining checks can run
    console.log("  (course was deleted by an anonymous call - recreating for the remaining checks)");
    const c2 = await call("POST", "/course/createCourse", { token: T.ins, form: cf() }); courseId = c2.data.newCourse._id;
    const s2 = await call("POST", "/course/addSection", { token: T.ins, json: { courseId, sectionName: "Intro" } }); sectionId = s2.data.newSection._id;
    const u2 = await call("POST", "/course/addSubSection", { token: T.ins, form: fileForm({ sectionId, title: "Lecture 1", description: "first", timeDuration: "1" }, { video: "l1.mp4" }) }); subId = u2.data.updatedSection.subSection[0]._id;
  }

  // ---------------- STUDENT: payment, learning, reviews ----------------
  const live = async () => !exited;
  const capEmpty = await call("POST", "/payment/capturePayment", { token: T.stu, json: {} });
  rec("capturePayment without courses fails cleanly (server stays up)", capEmpty.status >= 400 && (await live()), `status ${capEmpty.status}, server ${await live() ? "up" : "CRASHED"}`);
  if (!(await live())) { console.log("SERVER CRASHED - remaining checks skipped"); return finish(mongod, smtp); }
  const cap = await call("POST", "/payment/capturePayment", { token: T.stu, json: { courses: [courseId] } });
  rec("capturePayment creates an order", cap.status === 200 && cap.data.success && cap.data.message.id, `status ${cap.status}`);
  const orderId = cap.data.message && cap.data.message.id;
  const payId = "pay_TEST123";
  const sig = crypto.createHmac("sha256", SECRET).update(orderId + "|" + payId).digest("hex");
  const bad = await call("POST", "/payment/verifyPayment", { token: T.stu, json: { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: "bad", courses: [courseId] } });
  rec("verifyPayment rejects a bad signature", !(bad.data && bad.data.success === true), `status ${bad.status}`);
  const enrolledBefore = (await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId) })).studentsEnrolled.length;
  const ver = await call("POST", "/payment/verifyPayment", { token: T.stu, json: { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig, courses: [courseId] } });
  rec("verifyPayment with a valid signature enrolls the student", ver.status === 200 && ver.data.success === true, `status ${ver.status}`);
  const enrolledAfter = (await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId) })).studentsEnrolled.length;
  rec("student is added exactly once", enrolledAfter === enrolledBefore + 1, `${enrolledBefore} -> ${enrolledAfter}`);
  const ver2 = await call("POST", "/payment/verifyPayment", { token: T.stu, json: { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig, courses: [courseId] } });
  const enrolled2 = (await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId) })).studentsEnrolled.length;
  rec("replaying the same payment does not enroll twice", enrolled2 === enrolledAfter, `${enrolledAfter} -> ${enrolled2}`);
  rec("capturePayment says already registered", (await call("POST", "/payment/capturePayment", { token: T.stu, json: { courses: [courseId] } })).data.success === false, "");
  const spm = await call("POST", "/payment/sendPaymentSuccessEmail", { token: T.stu, json: { orderId, paymentId: payId, amount: 49900 }, timeout: 5000 });
  rec("sendPaymentSuccessEmail responds", spm.status === 200, `status ${spm.status} ${typeof spm.data === "string" ? spm.data : ""}`);
  const ec = await call("GET", "/profile/getEnrolledCourses", { token: T.stu });
  rec("getEnrolledCourses works with a progress percentage", ec.status === 200 && ec.data.data.length === 1 && Number.isFinite(ec.data.data[0].progressPercentage), `status ${ec.status} progress=${ec.data.data && ec.data.data[0] && ec.data.data[0].progressPercentage}`);
  const fcd = await call("POST", "/course/getFullCourseDetails", { token: T.stu, json: { courseId } });
  rec("getFullCourseDetails works", fcd.status === 200, `status ${fcd.status}`);
  const prog = await call("POST", "/course/updateCourseProgress", { token: T.stu, json: { courseId, subSectionId: subId } });
  rec("updateCourseProgress marks a lecture complete", prog.status === 200 && prog.data.success, `status ${prog.status}`);
  const ec2 = await call("GET", "/profile/getEnrolledCourses", { token: T.stu });
  rec("progress percentage becomes 100 after the only lecture", ec2.data.data && ec2.data.data[0].progressPercentage === 100, `${ec2.data.data && ec2.data.data[0].progressPercentage}`);
  const rate = await call("POST", "/course/createRating", { token: T.stu, json: { courseId, rating: 4, review: "good" } });
  rec("createRating works for an enrolled student", rate.status === 200, `status ${rate.status}`);
  rec("a second review by the same student is rejected", (await call("POST", "/course/createRating", { token: T.stu, json: { courseId, rating: 5, review: "again" } })).status === 403, "");
  const rev = await call("GET", "/course/getReviews");
  rec("getReviews works", rev.status === 200 && rev.data.data.length === 1, `status ${rev.status}`);
  const avg = await call("GET", "/course/getAverageRating?courseId=" + courseId);
  rec("getAverageRating returns 4", avg.status === 200 && avg.data.averageRating === 4, `status ${avg.status} avg=${avg.data && avg.data.averageRating}`);
  const notEnrolled = await call("POST", "/course/createRating", { token: T.ins2, json: { courseId, rating: 5, review: "x" } });
  rec("non-enrolled user cannot review", notEnrolled.status === 404 || notEnrolled.status === 401, `status ${notEnrolled.status}`);

  // ---------------- DELETE ----------------
  const dsub2 = await call("POST", "/course/deleteSubSection", { token: T.ins, json: { subSectionId: subId, sectionId } });
  rec("deleteSubSection works", dsub2.status === 200, `status ${dsub2.status}`);
  const dsec = await call("POST", "/course/deleteSection", { token: T.ins, json: { sectionId, courseId } });
  rec("deleteSection works", dsec.status === 200, `status ${dsec.status}`);
  const dsecCourse = await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId) });
  rec("deleted section is removed from the course", !dsecCourse || dsecCourse.courseContent.length === 0, `courseContent=${dsecCourse ? dsecCourse.courseContent.length : "n/a"}`);
  const delOwn = await call("DELETE", "/course/deleteCourse", { token: T.ins, json: { courseId } });
  rec("owner can delete the course", delOwn.status === 200, `status ${delOwn.status}`);
  const delAcc = await call("DELETE", "/profile/deleteProfile", { token: T.stu });
  rec("deleteProfile works", delAcc.status === 200, `status ${delAcc.status}`);
  rec("server survived the whole run", await live(), "");
  return finish(mongod, smtp);
}

async function finish(mongod, smtp) {
  const fail = results.filter((r) => !r.ok);
  console.log(`\n==== ${LABEL}: ${results.length - fail.length}/${results.length} passed, ${fail.length} failed ====`);
  fail.forEach((f) => console.log("  FAIL: " + f.name + (f.detail ? "  (" + f.detail + ")" : "")));
  try { child.kill(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  smtp.close(); await mongod.stop();
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error("RUNNER ERROR", e); try { child.kill(); } catch {} process.exit(3); });
