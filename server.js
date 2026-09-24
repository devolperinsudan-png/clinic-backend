// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = "Clinic_Cyber_Security_Token_2026_Secure";
// استبدل هذا الرابط برابط قاعدة بيانات MongoDB الحقيقية الخاصة بك (محلي أو سحابي Atlas)
// تحديث سطر الاتصال بقاعدة البيانات السحابية الحقيقية Atlas
const MONGO_URI = "mongodb+srv://Dadbes_in_sudan:Ma39hd49i@@cluster0.8h3dblw.mongodb.net/digital_clinic?retryWrites=true&w=majority&appName=Cluster0";
// الاتصال بقاعدة البيانات الحقيقية
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بنجاح بقاعدة بيانات MongoDB الحقيقية'))
  .catch(err => console.error('❌ فشل الاتصال بقاعدة البيانات:', err));

// --- إعداد العدادات التلقائية الفريدة في قاعدة البيانات (Auto-increment Counter) ---
const counterSchema = new mongoose.Schema({
    _id: String,
    seq: Number
});
const Counter = mongoose.model('Counter', counterSchema);

// دالة لتوليد المعرف الفريد الصارم
async function getNextSequenceValue(sequenceName, startValue) {
   let sequenceDocument = await Counter.findOneAndUpdate(
      { _id: sequenceName },
      { \$inc: { seq: 1 } },
      { new: true, upsert: true }
   );
   if (sequenceDocument.seq < startValue) {
       sequenceDocument.seq = startValue;
       await sequenceDocument.save();
   }
   return sequenceDocument.seq;
}

// --- بناء المخططات (Schemas) والجداول الحقيقية ---
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    gender: { type: String, enum: ['ذكر', 'أنثى'], required: true },
    isDoctor: { type: Boolean, default: false },
    // حقول خاصة بالطبيب فقط
    specialty: String,
    details: String,
    startHour: { type: Number, default: 9 },
    endHour: { type: Number, default: 17 },
    isActiveServerSide: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// --- بوابات استقبال الطلبات الآمنة عبر الإنترنت ---

// 1. تسجيل مريض جديد وحفظه في قاعدة البيانات
app.post('/v1/auth/register/patient', async (req, res) => {
    try {
        const { name, phone, email, password, gender, age } = req.body;
        
        // التحقق من تكرار البريد الإلكتروني في قاعدة البيانات
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً" });

        const passwordHash = await bcrypt.hash(password, 10); // تشفير قوي بـ BCrypt
        
        // عداد المرضى يبدأ من 10001 بشكل صارم
        const assignedId = await getNextSequenceValue('patientId', 10001);

        const newPatient = new User({
            id: assignedId, name, phone, email, passwordHash, gender, isDoctor: false
        });
        await newPatient.save();
        
        res.status(201).json({ success: true, assigned_id: assignedId });
    } catch (e) {
        res.status(500).json({ error: "فشل تسجيل المريض في قاعدة البيانات الحقيقية" });
    }
});

// 2. تسجيل طبيب جديد وحفظه في قاعدة البيانات
app.post('/v1/auth/register/doctor', async (req, res) => {
    try {
        const { name, phone, email, password, gender, specialty, details, startHour, endHour } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً" });

        const passwordHash = await bcrypt.hash(password, 10);
        
        // عداد الأطباء يبدأ من 1 ويتصاعد (شرط حماية سيبرانية أقل من 10000)
        const assignedId = await getNextSequenceValue('doctorId', 1);
        if (assignedId > 10000) return res.status(400).json({ error: "تجاوز الحد الأقصى لنطاق معرفات الأطباء الحرج" });

        const newDoctor = new User({
            id: assignedId, name, phone, email, passwordHash, gender, isDoctor: true,
            specialty, details, startHour: startHour || 9, endHour: endHour || 17
        });
        await newDoctor.save();
        
        res.status(201).json({ success: true, assigned_id: assignedId });
    } catch (e) {
        res.status(500).json({ error: "فشل تسجيل الطبيب في قاعدة البيانات" });
    }
});

// 3. تسجيل الدخول والمطابقة الحقيقية للتشفير
app.post('/v1/auth/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        const user = await User.findOne({ id: parseInt(id) });
        
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود في قاعدة البيانات" });

        const isMatch = await bcrypt.compare(password, user.passwordHash); // مطابقة تشفير BCrypt الآمن
        if (!isMatch) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });

        const token = jwt.sign({ id: user.id, is_doctor: user.isDoctor }, JWT_SECRET);
        res.json({ 
            token, 
            user: { id: user.id, name: user.name, phone: user.phone, email: user.email, gender: user.gender, is_doctor: user.isDoctor } 
        });
    } catch (e) {
        res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
    }
});

// 4. جلب الأطباء مع حالتهم الحقيقية المتزامنة بالوقت
app.get('/v1/doctors', async (req, res) => {
    try {
        const doctorsList = await User.find({ isDoctor: true });
        res.json(doctorsList);
    } catch (e) {
        res.status(500).json({ error: "فشل جلب الأطباء" });
    }
});

// --- وظيفة الخلفية التلقائية (Cron Job) لتحديث علامة النشاط بالسيرفر ---
setInterval(async () => {
    try {
        const currentHour = new Date().getHours();
        
        // تحديث جماعي لكل الأطباء في قاعدة البيانات الحقيقية دفعة واحدة بناءً على الساعات
        // إذا كانت الساعة الحالية تقع بين ساعة البداية والنهاية، يصبح الطبيب نشطاً (علامة خضراء بالتطبيق)
        await User.updateMany(
            { isDoctor: true, startHour: { lte: currentHour , endHour: gt: currentHour } },
            { \$set: { isActiveServerSide: true } }
        );
        await User.updateMany(
            { isDoctor: true, \$or: [{ startHour: { gt: currentHour , endHour: lte: currentHour } }] },
            { \$set: { isActiveServerSide: false } }
        );
        
        console.log(`[Cron Job] 🔄 تم تحديث حالة الأطباء تلقائياً في قاعدة البيانات الحقيقية للساعة الحالية: ${currentHour}:00`);
    } catch (err) {
        console.error("خطأ في وظيفة Cron تحديث الأطباء:", err);
    }
}, 60000); // تتحقق كل دقيقة بدقة عالية دون الحاجة لتدخل المستخدم

app.listen(3000, () => console.log('🚀 السيرفر الحقيقي المشفر يعمل بنجاح على المنفذ 3000 ويحفظ في MongoDB...'));
