// src/utils/logoBase64.js

/**
 * Convert image file to base64 string for pdfMake
 * This function loads the logo and converts it to base64
 */

// Import the logo image
import logoImage from '../assets/CGA Logo.jpg';

/**
 * Get logo as base64 string
 * @returns {Promise<string>} Base64 encoded logo
 */
export async function getLogoBase64() {
  try {
    // Fetch the image
    const response = await fetch(logoImage);
    const blob = await response.blob();
    
    // Convert to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
}

/**
 * Alternative: Pre-converted base64 logo
 * If you want to avoid async operations, you can:
 * 1. Run this once to get the base64 string
 * 2. Replace the exported constant below with the actual base64 string
 */
export const LOGO_BASE64 = null; // Replace with actual base64 string if needed