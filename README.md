# CareerPay Backend

A Node.js/Express backend API for the CareerPay application, designed to handle career-related financial services and HR management.

## 🚀 Features

- **Express.js Server**: Fast, unopinionated web framework for Node.js
- **MongoDB Integration**: Database connectivity using Mongoose ODM
- **Authentication**: JWT-based authentication with middleware support
- **Security**: CORS enabled, rate limiting, and password hashing with bcrypt
- **Email Services**: Nodemailer integration for email functionality
- **Deployment Ready**: Configured for Vercel deployment

## 📋 Prerequisites

Before running this project, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [MongoDB](https://www.mongodb.com/) (local or cloud instance)
- npm or yarn package manager

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd career-pay-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory and add the following variables:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   PORT=5000
   NODE_ENV=development
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   Or for production:
   ```bash
   npm run server
   ```

## 📁 Project Structure

```
career-pay-backend/
├── config/
│   └── db.js              # Database configuration
├── controllers/            # Route controllers (to be implemented)
├── middlewares/
│   └── authMiddleware.js   # Authentication middleware
├── models/                 # Database models (to be implemented)
├── routes/                 # API routes (to be implemented)
├── utils/
│   └── generateToken.js    # JWT token utilities
├── server.js              # Main server file
├── package.json           # Project dependencies
└── vercel.json            # Vercel deployment configuration
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm run server` - Start production server
- `npm test` - Run tests (to be implemented)

## 🌐 API Endpoints

Currently, the API has a basic health check endpoint:

- `GET /` - Returns API status and development mode confirmation

Additional endpoints will be implemented in the controllers and routes directories.

## 🚀 Deployment

This project is configured for deployment on Vercel. The deployment configuration is included in `vercel.json`.

To deploy:

1. Push your code to a Git repository
2. Connect your repository to Vercel
3. Set up environment variables in Vercel dashboard
4. Deploy automatically on push

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **CORS**: Cross-origin resource sharing enabled
- **Rate Limiting**: API rate limiting to prevent abuse
- **Environment Variables**: Sensitive data stored in environment variables

## 📦 Dependencies

### Core Dependencies
- **express**: Web framework for Node.js
- **mongoose**: MongoDB object modeling for Node.js
- **jsonwebtoken**: JWT implementation
- **bcrypt**: Password hashing library
- **cors**: CORS middleware
- **dotenv**: Environment variable loader
- **express-rate-limit**: Rate limiting middleware
- **nodemailer**: Email sending library
- **axios**: HTTP client
- **mongodb**: MongoDB driver

### Development Dependencies
- **nodemon**: Development server with auto-restart

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## 📞 Support

For support and questions, please contact the development team or create an issue in the repository.


