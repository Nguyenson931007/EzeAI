const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

// Cấu hình đường dẫn DB (trỏ đến backend/ezefloor.db)
const dbPath = path.resolve(__dirname, '../backend/ezefloor.db');
const db = new sqlite3.Database(dbPath);

const salt = "ezefloor_salt_123";

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}


/**
 * Danh sách tài khoản muốn tạo tự động
 */
const accountsToCreate = [
  { username: 'admin', password: 'admin123', email: 'admin@ezefloor.ai', role: 'admin' },
  { username: 'user1', password: '123456', email: 'user1@example.com', role: 'user' },
  { username: 'demo', password: '123456', email: 'demo@ezefloor.ai', role: 'user' },
  { username: 'Ken', password: '123456', email: 'ken@ezefloor.ai', role: 'user' },
  // Thêm các tài khoản khác vào đây...
];

/**
 * Hàm tạo tài khoản mới (trả về Promise)
 */
function createAccount(username, password, email, role = 'user') {
  return new Promise((resolve, reject) => {
    const hashedPassword = hashPassword(password);
    const status = 'active';
    const isActive = 1;

    const sql = `INSERT INTO users (username, email, hashed_password, role, status, is_active) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(sql, [username, email, hashedPassword, role, status, isActive], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.error(`❌ Lỗi: Username hoặc Email của [${username}] đã tồn tại.`);
        } else {
          console.error(`❌ Lỗi khi tạo [${username}]:`, err.message);
        }
        resolve(); // Vẫn resolve để tiếp tục các user khác
        return;
      }
      console.log(`✅ Đã tạo thành công tài khoản [${username}] với vai trò [${role}]`);
      resolve();
    });
  });
}

// --- THỰC THI TẠO DANH SÁCH TÀI KHOẢN ---
async function run() {
  console.log('--- ĐANG TẠO DANH SÁCH TÀI KHOẢN TỰ ĐỘNG ---');
  
  for (const acc of accountsToCreate) {
    await createAccount(acc.username, acc.password, acc.email, acc.role);
  }

  console.log('--- HOÀN TẤT ---');
  db.close();
}

run();
