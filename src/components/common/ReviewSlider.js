import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/pagination";

import "../../App.css";

import { Autoplay, FreeMode } from "swiper/modules";

function ReviewSlider() {

  const messages = [
    {
      name: "StudyNotion",
      text: "Welcome to StudyNotion 🚀 Learn coding, build real-world projects, and become industry ready."
    },
    {
      name: "StudyNotion",
      text: "Master programming skills with structured courses and hands-on practice."
    },
    {
      name: "StudyNotion",
      text: "Start your journey to become a professional software developer."
    },
    {
      name: "StudyNotion",
      text: "Build real projects and strengthen your coding skills step by step."
    }
  ];

  return (
    <div className="text-white">
      <div className="my-[50px] h-[184px] max-w-maxContentTab lg:max-w-maxContent">

        <Swiper
          slidesPerView={4}
          spaceBetween={25}
          loop={true}
          freeMode={true}
          autoplay={{
            delay: 2000,
            disableOnInteraction: false,
          }}
          modules={[FreeMode, Autoplay]}
          className="w-full"
        >

          {messages.map((msg, i) => (
            <SwiperSlide key={i}>
              <div className="flex flex-col gap-3 bg-richblack-800 p-4 text-[14px] text-richblack-25 rounded-lg">

                <h1 className="font-semibold text-richblack-5">
                  {msg.name}
                </h1>

                <p className="font-medium text-richblack-25">
                  {msg.text}
                </p>

              </div>
            </SwiperSlide>
          ))}

        </Swiper>

      </div>
    </div>
  );
}

export default ReviewSlider;