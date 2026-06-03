const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables from the .env file in the root directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl) {
  supabaseUrl = supabaseUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}
if (supabaseKey) {
  supabaseKey = supabaseKey.trim();
}

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️  Warning: SUPABASE_URL or SUPABASE_KEY (service role key) is missing from the environment variables.");
  console.warn("   Ensure you have created a '.env' file in the project root and populated it.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key', {
  auth: {
    persistSession: false, // We are running in a Node server environment
    autoRefreshToken: false
  }
});

module.exports = supabase;
