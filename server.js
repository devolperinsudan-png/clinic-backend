// server.js (النسخة النهائية المستقرة لبيئات الويب والاتصال السحابي الآمن)
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// تفعيل CORS لفك حظر متصفحات الويب ومتصفح FlutLab نهائياً
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "Clinic_Cyber_Security_Token_2026_Secure";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Dadbes_in_sudan:De3949sud@cluster0.8h3dblw.mongodb.net/digital_clinic?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected successfully to MongoDB Atlas'))
  .catch(err => console.error('❌ Database connection error:', err));

const counterSchema = new mongoose.Schema({
    _id: String,
    seq: Number
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextSequenceValue(sequenceName, startValue) {
   // ✅ تم تعديل كتابة الـ inc وحذف الرموز المسببة للمشاكل المعمارية عند الإقلاع
   let sequenceDocument = await Counter.findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { seq: 1 } }, 
      { new: true, upsert: true }
   );
   if (sequenceDocument.seq < startValue) {
       sequenceDocument.seq = startValue;
       await sequenceDocument.save();
   }
   return sequenceDocument.seq;
}

const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    gender: { type: String, enum: ['ذكر', 'أنثى'], required: true },
    isDoctor: { type: Boolean, default: false },
    specialty: String,
    details: String,
    startHour: { type: Number, default: 9 },
    endHour: { type: Number, default: 17 },
    isActiveServerSide: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

app.post('/v1/auth/register/patient', async (req, res) => {
    try {
        const { name, phone, email, password, gender } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً" });

        const passwordHash = await bcrypt.hash(password, 10);
        const assignedId = await getNextSequenceValue('patientId', 10001);

        const newPatient = new User({ id: assignedId, name, phone, email, passwordHash, gender, isDoctor: false });
        await newPatient.save();
        res.status(201).json({ success: true, assigned_id: assignedId });
    } catch (e) {
        res.status(500).json({ error: "فشل تسجيل المريض" });
    }
});

app.post('/v1/auth/register/doctor', async (req, res) => {
    try {
        const { name, phone, email, password, gender, specialty, details, startHour, endHour } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً" });

        const passwordHash = await bcrypt.hash(password, 10);
        const assignedId = await getNextSequenceValue('doctorId', 1);
        if (assignedId > 10000) return res.status(400).json({ error: "تجاوز الحد الأقصى لنطاق معرفات الأطباء" });

        const newDoctor = new User({
            id: assignedId, name, phone, email, passwordHash, gender, isDoctor: true,
            specialty, details, startHour: startHour || 9, endHour: endHour || 17
        });
        await newDoctor.save();
        res.status(201).json({ success: true, assigned_id: assignedId });
    } catch (e) {
        res.status(500).json({ error: "فشل تسجيل الطبيب" });
    }
});

app.post('/v1/auth/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        const user = await User.findOne({ id: parseInt(id) });
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });

        const token = jwt.sign({ id: user.id, is_doctor: user.isDoctor }, JWT_SECRET);
        res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, gender: user.gender, is_doctor: user.isDoctor } });
    } catch (e) {
        res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
    }
});

app.get('/v1/doctors', async (req, res) => {
    try {
        const doctorsList = await User.find({ isDoctor: true });
        res.json(doctorsList);
    } catch (e) {
        res.status(500).json({ error: "فشل جلب الأطباء" });
    }
});

app.get('/', (req, res) => {
    res.send('🚀 Digital Clinic Backend API is live and working smoothly!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running securely on port ${PORT}`);
});
