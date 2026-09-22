const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const { loadProjectEnv, resolveSqlitePath } = require('./env');
const env = loadProjectEnv();
const dbPath = resolveSqlitePath(env);
const salt = env.PASSWORD_SALT;
if (!salt) throw new Error('PASSWORD_SALT is not configured in .env');
const readline = require('readline');

const db = new sqlite3.Database(dbPath);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('--- NHẬP THÔNG TIN TÀI KHOẢN MỚI ---');

  try {
    const username = await question('Nhập Username: ');
    if (!username) {
      console.log('❌ Username không được để trống.');
      process.exit(1);
    }

    const email = await question('Nhập Email: ');
    if (!email) {
      console.log('❌ Email không được để trống.');
      process.exit(1);
    }

    const password = await question('Nhập Password: ');
    if (!password) {
      console.log('❌ Password không được để trống.');
      process.exit(1);
    }

    let role = await question('Nhập Vai trò (admin/user) [mặc định: user]: ');
    if (!role) role = 'user';
    if (!['admin', 'user'].includes(role.toLowerCase())) {
        console.log('⚠️ Vai trò không hợp lệ, đang đặt là "user"');
        role = 'user';
    }

    const hashedPassword = hashPassword(password);
    const status = 'active'; 
    const isActive = 1;

    const sql = `INSERT INTO users (username, email, hashed_password, role, status, is_active) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(sql, [username, email, hashedPassword, role.toLowerCase(), status, isActive], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.error(`❌ Lỗi: Username [${username}] hoặc Email [${email}] đã tồn tại.`);
        } else {
          console.error('❌ Lỗi:', err.message);
        }
      } else {
        console.log(`\n✅ Đã tạo thành công tài khoản:`);
        console.log(`   - Username: ${username}`);
        console.log(`   - Email:    ${email}`);
        console.log(`   - Role:     ${role}`);
      }
      
      db.close();
      rl.close();
    });

  } catch (error) {
    console.error('❌ Có lỗi xảy ra:', error);
    db.close();
    rl.close();
  }
}

main();
