import connectDB from "./config/db.js";
import app from './app.js';
import 'dotenv/config'; 


const startServer = async () => {
  // Connect to database
  await connectDB();
  
  // Start listening
  const PORT = process.env.PORT;
  const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`API URL: http://localhost:${PORT}/api`);
    console.log(`Health Check: http://localhost:${PORT}/api/health\n`);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });
  
  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });
};

startServer();