import React from "react";

const Catch = () => {
  return (
    <section className="px-0 lg:px-[110px] py-10 text-whtie">
      <div className="bg-[#121212] min-h-max lg:min-h-[447px] rounded-none lg:rounded-lg text-white flex flex-col lg:flex-row items-center justify-between">
        <div className="px-20 lg:px-[60px] py-20 lg:py-[60px] w-full lg:w-[80%]">
          <h2 className="text-[70px] lg:text-[50px] leading-[1.1] mb-6">
            Access borderless Compensation management in one digital space
          </h2>
          <p className="text-[35px] lg:text-lg text-white/70 font-sfPro font-light">
            Break free from traditional compensation limitations. Career Pay
            eliminates the barriers between ambition and achievement, creating
            seamless pathways for businesses to reward talent regardless of
            size, stage, or structure. Transform how you think about employee
            compensation with solutions that adapt to your unique journey and
            growth trajectory
          </p>
        </div>
        <div className="p-[35px] lg:p-[60px]">
          <img src="/bounds.svg" alt="" className="w-full object-cover"/>
        </div>
      </div>
    </section>
  );
};

export default Catch;
