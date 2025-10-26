import React from "react";
import { AiFillInstagram } from "react-icons/ai";
import { FaFacebookSquare, FaLinkedin } from "react-icons/fa";
import { IoLogoYoutube } from "react-icons/io5";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="px-20 lg:px-20 xl:px-[80px] bg-black py-20 text-white mt-40 lg:mt-20">
      <div className="max-w-7xl mx-auto">
        {/* Logo Section - Mobile First */}
        <div className="mb-12 lg:text-left">
          <img
            src="/careerpay-logo.png"
            alt="CareerPay Logo"
            className="w-[250px] lg:w-[180px] h-auto"
          />
        </div>

        {/* Links and Newsletter Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 md:gap-8 lg:gap-12">
          {/* Company Links */}
          <div className="text-center md:text-left">
            <h3 className="text-[30px] font-bold mb-6 text-white">Company</h3>
            <ul className="space-y-4">
              <li>
                <Link
                  to="/"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Links */}
          <div className="text-center md:text-left">
            <h3 className="text-[30px] font-bold mb-6 text-white">Support</h3>
            <ul className="space-y-4">
              <li>
                <Link
                  to="/help"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  Help Center
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-gray-300 hover:text-white transition-colors duration-200 text-[25px] lg:text-base block py-1"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Section */}
          <div className="text-center md:text-left md:col-span-2 lg:col-span-1">
            <h3 className="text-[30px] font-bold mb-6 text-white">
              Stay up to date
            </h3>
            <div className="space-y-6">
              <p className="text-[25px] lg:text-base text-gray-300 leading-relaxed max-w-xs mx-auto md:mx-0">
                Get the latest updates and news delivered to your inbox
              </p>

              {/* Newsletter Form - Mobile Optimized */}
              <div className="flex items-center justify-center gap-3 lg:gap-0">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="w-full px-4 py-4 rounded-l-lg text-black text-[25px] lg:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 h-[100px] lg:h-auto "
                />
                <button className="w-full md:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-r-lg transition-colors duration-200  font-semibold text-white h-[100px] lg:h-auto text-3xl lg:text-base">
                  Subscribe
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Border/Copyright */}
      <div className="mt-16 pt-8 border-t border-gray-800">
        <div className="flex flex-col space-y-6 md:flex-row md:justify-between md:items-center md:space-y-0">
          <p className="text-lg lg:text-sm text-gray-400 text-center md:text-left">
            © 2025 CareerPay. All rights reserved.
          </p>

          <div>
            <div className="flex items-center justify-center lg:justify-between w-full lg:w-[70%] mb-2 space-x-2">
              <AiFillInstagram className="text-[30px] lg:text-[25px] hover:text-white text-gray-400" />
              <FaLinkedin className="text-[30px] lg:text-[25px] hover:text-white text-gray-400" />
              <FaFacebookSquare className="text-[30px] lg:text-[25px] hover:text-white text-gray-400" />
              <IoLogoYoutube className="text-[30px] lg:text-[25px] hover:text-white text-gray-400" />
            </div>
            <div className="flex justify-center md:justify-end space-x-8">
              <Link
                to="/privacy"
                className="text-lg lg:text-sm text-gray-400 hover:text-white transition-colors"
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                className="text-lg lg:text-sm text-gray-400 hover:text-white transition-colors"
              >
                Terms
              </Link>
              <Link
                to="/cookies"
                className="text-lg lg:text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
