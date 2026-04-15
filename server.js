import 'dotenv/config'; 
import connectDB from "./config/db.js";
import app from './app.js';
import worker from './services/paymentWorker.js';

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start payment worker — processes payroll payment jobs from queue
    // Runs continuously in background alongside the API server
    console.log('Payment worker started and listening for jobs...');

    // Start listening
    const PORT = process.env.PORT || 5000;
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

    // Handle SIGTERM — graceful shutdown
    // Close worker before shutting down so no jobs are lost mid-processing
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      
      // Close worker first — waits for current job to finish before stopping
      await worker.close();
      console.log('Payment worker closed');

      server.close(() => {
        console.log('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error(`Startup error: ${error.message}`);
    process.exit(1);
  }
};

startServer();