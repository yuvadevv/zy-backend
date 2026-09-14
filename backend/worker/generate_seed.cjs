const fs = require('fs');
const path = require('path');

const now = Date.now();

const initialFaqs = [
  { category: 'General', question: 'What is BLINTZY?', answer: 'BLINTZY is a campus-focused service platform designed to make student and campus-related services more convenient, organized, and accessible through a single digital platform.' },
  { category: 'General', question: 'Who can use BLINTZY?', answer: 'BLINTZY is primarily designed for students and authorized campus users. Access to specific services may depend on the campus, service availability, and account eligibility.' },
  { category: 'General', question: 'Which location does BLINTZY currently serve?', answer: 'BLINTZY currently focuses on campus services associated with Ramachandra College of Engineering, Eluru, Andhra Pradesh. Service availability may change based on operational coverage.' },
  { category: 'Account and Login', question: 'How do I create a BLINTZY account?', answer: 'Select the Sign Up or Create Account option, enter the required details, and complete the onboarding process.' },
  { category: 'Account and Login', question: 'What happens if my email is already registered?', answer: 'If the email is already associated with an account, BLINTZY will display: This email is already registered. Please log in or use "Forgot Password" if you cannot access your account. You can then go to Login or use Forgot Password.' },
  { category: 'Account and Login', question: 'I forgot my password. What should I do?', answer: 'Open the Forgot Password option, enter your registered email address, and request a password-reset link. Check your inbox and spam/junk folder. Open the link and create a new password.' },
  { category: 'Printing Services', question: 'What services are available through BLINTZY?', answer: 'Depending on current availability, BLINTZY may support: PDF printing, Black-and-white printing, Colour printing, Single-sided printing, Double-sided printing, Photocopying, Spiral binding, Manual printing, Custom document uploads, Pickup and/or delivery services.' },
  { category: 'Printing Services', question: 'What file formats can I upload?', answer: 'PDF files are supported for document printing. If additional formats are supported in the future, they should be displayed dynamically from the service configuration.' },
  { category: 'Printing Services', question: 'Can I upload my own document?', answer: 'Yes, users may upload supported documents for printing, subject to file-size, file-type, content, and service restrictions.' },
  { category: 'Orders and Payments', question: 'How can I place a printing order?', answer: 'Select a service, upload or choose the required document, configure printing preferences, review the order details, and complete payment if required.' },
  { category: 'Orders and Payments', question: 'How can I check my order status?', answer: 'Open the Orders section to view the current status, order details, payment status, and available pickup or delivery information.' },
  { category: 'Pickup and Delivery', question: 'What are BLINTZY’s service timings?', answer: 'BLINTZY’s printing, pickup, delivery, and order-processing timings may vary depending on operational availability. The latest timings must be controlled and displayed through the admin panel.' },
  { category: 'Uploaded Files', question: 'Are my uploaded files private?', answer: 'Uploaded files should be used only for the requested service and order fulfillment. Access must be limited to the user and authorized BLINTZY administrators or assigned service providers who require access to complete the order.' },
  { category: 'Cancellation and Refunds', question: 'Can I cancel my order?', answer: 'Cancellation depends on the order status and whether printing, binding, delivery, or processing has already started. The application should display the applicable cancellation rules.' },
  { category: 'Support', question: 'How can I contact BLINTZY Support?', answer: 'Users can contact BLINTZY through: Email: theblintzy@gmail.com' }
];

let sql = '';
let order = 1;
for (const faq of initialFaqs) {
  const id = 'faq_' + Math.random().toString(36).substr(2, 9);
  sql += `INSERT INTO faqs (id, category, question, answer, display_order, status, created_at, updated_at) VALUES ('${id}', '${faq.category.replace(/'/g, "''")}', '${faq.question.replace(/'/g, "''")}', '${faq.answer.replace(/'/g, "''")}', ${order++}, 'active', ${now}, ${now});\n`;
}

sql += `
INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES ('support_email', 'theblintzy@gmail.com', ${now}) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at;
INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES ('app_version', 'APP VERSION V1.0.0', ${now}) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at;
`;

fs.writeFileSync(path.join(__dirname, 'seed_faqs.sql'), sql);
