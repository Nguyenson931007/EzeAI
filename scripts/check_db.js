const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/ezefloor.db');
console.log('Checking database at:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all("SELECT id, username, email, role, status, is_active FROM users", [], (err, rows) => {
  if (err) {
    console.error('Error reading database:', err.message);
    return;
  }
  
  console.log('\n--- DANH SÁCH USER HIỆN TẠI TRONG DB ---');
  if (rows.length === 0) {
    console.log('Không có user nào.');
  } else {
    rows.forEach((row) => {
      console.log(`ID: ${row.id} | Username: ${row.username} | Email: ${row.email} | Role: ${row.role} | Status: ${row.status}`);
    });
  }
  console.log('----------------------------------------\n');
  db.close();
});
