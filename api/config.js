// Gir nettleseren de offentlige Supabase-verdiene (URL og anon-nøkkel er ment å være offentlige).
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
  });
};
