// Preloaded into the server with NODE_OPTIONS=--require. Test-only stubs for the two paid
// external services (Cloudinary uploads, Razorpay orders). Nothing here ships in the repo.
const path = require("path");
const SERVER = process.env.SERVER_DIR || path.resolve(__dirname, "..");
const fromServer = (m) => require(require.resolve(m, { paths: [SERVER] }));

const cloudinary = fromServer("cloudinary").v2;
cloudinary.uploader.upload = async (file) => ({
  secure_url: "https://res.cloudinary.test/" + path.basename(String(file)),
  duration: 125.4,
  public_id: "stub",
});

const { instance } = require(path.join(SERVER, "config", "razorpay.js"));
instance.orders.create = async (opts) => ({
  id: "order_STUB" + Date.now(),
  currency: opts.currency,
  amount: opts.amount,
  receipt: opts.receipt,
});
