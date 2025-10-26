import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiMenu, HiX } from "react-icons/hi";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup function to reset when component unmounts
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      // Use a specific pixel value instead of section height
      const scrollThreshold = window.innerHeight * 0.5;
      setIsScrolled(window.scrollY > scrollThreshold);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Call once on mount to set initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`min-h-[91px] fixed z-40 text-white w-full flex items-center justify-between px-[35px] lg:px-16 py-10 text-base lg:text-lg tracking-wide transition-all duration-300 ${
        isScrolled && !isMenuOpen
          ? "bg-black/30 backdrop-blur-md shadow-lg shadow-slate-500/20 -top-[2px]"
          : "bg-transparent"
      }`}
    >
      {/* Logo */}
      <Link to="/" onClick={closeMenu}>
        <img
          src="/careerpay-logo.png"
          alt="Careerpay"
          className="w-[250px] lg:w-[180px] h-auto"
        />
      </Link>

      {/* Desktop Navigation */}
      <ul className="hidden lg:flex space-x-6">
        <li>
          <Link
            to="/"
            className="hover:text-gray-300 transition-colors duration-200"
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/about"
            className="hover:text-gray-300 transition-colors duration-200"
          >
            About
          </Link>
        </li>
        <li>
          <Link
            to="/contact"
            className="hover:text-gray-300 transition-colors duration-200"
          >
            Contact
          </Link>
        </li>
      </ul>

      {/* Desktop Auth Buttons */}
      <div className="hidden lg:flex space-x-4">
        <button
          type="button"
          className="px-6 py-3 rounded-md hover:bg-white hover:text-[#121212] duration-300 ease-in-out transition-all"
        >
          Log In
        </button>
        <button
          type="button"
          className="border border-white px-6 py-3 rounded-md hover:bg-white hover:text-[#121212] duration-300 ease-in-out transition-all"
        >
          Sign Up
        </button>
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={toggleMenu}
        className="lg:hidden flex items-center justify-center  group"
        aria-label="Toggle menu"
      >
        <HiMenu className="text-[70px] text-white transition-all duration-300" />
      </button>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={closeMenu}
        ></div>
      )}

      {/* Mobile Menu */}
      <div
        className={`lg:hidden fixed top-0 right-0 w-[60%] h-full bg-black border-l border-white/10 z-50 transform transition-transform duration-300 ease-in-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between h-[120px] p-6 border-b border-gray-700">
          <img
            src="/careerpay-logo.png"
            alt="Careerpay"
            className="w-[150px] h-auto"
          />
          <button
            onClick={closeMenu}
            className="text-white text-2xl hover:text-gray-300 transition-colors"
            aria-label="Close menu"
          >
            <HiX className="text-[70px]" />
          </button>
        </div>

        {/* Mobile Navigation Links */}
        <div className="px-6 py-16">
          <ul className="space-y-16 mb-8">
            <li>
              <Link
                to="/"
                onClick={closeMenu}
                className="block font-medium hover:text-gray-300 transition-colors duration-200 py-2 text-4xl"
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                to="/about"
                onClick={closeMenu}
                className="block font-medium hover:text-gray-300 transition-colors duration-200 py-2 text-4xl"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                to="/testimonials"
                onClick={closeMenu}
                className="block font-medium hover:text-gray-300 transition-colors duration-200 py-2 text-4xl"
              >
                Testimonials
              </Link>
            </li>
            <li>
              <Link
                to="/contact"
                onClick={closeMenu}
                className="block font-medium hover:text-gray-300 transition-colors duration-200 py-2 text-4xl"
              >
                Contact
              </Link>
            </li>
          </ul>

          {/* Mobile Auth Buttons */}
          <div className="space-y-6">
            <button
              type="button"
              onClick={closeMenu}
              className="w-full h-[100px] px-6 py-3 rounded-md hover:bg-white hover:text-[#121212] duration-300 ease-in-out transition-all text-center text-3xl"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={closeMenu}
              className="w-full h-[100px] border border-white px-6 py-3 rounded-md hover:bg-white hover:text-[#121212] duration-300 ease-in-out transition-all text-center text-3xl"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
