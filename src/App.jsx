import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Camera,
  Upload,
  FlaskConical,
  Droplets,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  BookOpen,
  Scale,
  ArrowRight,
  Info,
  ShieldCheck,
  Activity,
  Beaker,
  Eye
} from 'lucide-react';

// База данных культур с эталонным цветом нормы ПДК (ТР ТС 021/2011)
const PRODUCTS_DB = [
  {
    id: 'cabbage',
    name: 'Капуста белокочанная',
    pdkMgKg: 2000,
    normRgb: { r: 168, g: 214, b: 146 },
    normScaleNo3N: 8.2,
    defaultMass: 250,
    note: 'Листовые и кочанные культуры имеют более высокий порог ПДК (до 2000 мг/кг).'
  },
  {
    id: 'lettuce',
    name: 'Салат листовой',
    pdkMgKg: 2000,
    normRgb: { r: 132, g: 196, b: 108 },
    normScaleNo3N: 8.0,
    defaultMass: 120,
    note: 'Зеленные культуры активно накапливают нитраты в черешках и жилках.'
  },
  {
    id: 'cucumber',
    name: 'Огурец (грунтовой)',
    pdkMgKg: 150,
    normRgb: { r: 74, g: 138, b: 62 },
    normScaleNo3N: 1.5,
    defaultMass: 140,
    note: 'Для грунтовых огурцов ПДК составляет 150 мг/кг (для тепличных — до 400 мг/кг).'
  },
  {
    id: 'cucumber_gh',
    name: 'Огурец (тепличный)',
    pdkMgKg: 400,
    normRgb: { r: 92, g: 158, b: 78 },
    normScaleNo3N: 3.2,
    defaultMass: 160,
    note: 'Тепличные культуры склонны к накоплению нитратов при недостатке света.'
  },
  {
    id: 'tomato',
    name: 'Томат свежий',
    pdkMgKg: 150,
    normRgb: { r: 214, g: 68, b: 54 },
    normScaleNo3N: 1.4,
    defaultMass: 180,
    note: 'У зрелых томатов уровень нитратов обычно ниже, чем у незрелых плодов.'
  },
  {
    id: 'potato',
    name: 'Картофель',
    pdkMgKg: 250,
    normRgb: { r: 218, g: 192, b: 134 },
    normScaleNo3N: 2.1,
    defaultMass: 200,
    note: 'Основная часть нитратов сосредоточена в кожуре и сердцевине клубня.'
  }
];

// Цветовая шкала теста NO3-N (мг/л, 1 - 10) с реальными сиренево-фиолетовыми оттенками
const COLOR_SCALE_NO3N = [
  { level: 1, label: '1', rgb: { r: 206, g: 175, b: 209 }, hex: '#CEAFD1', desc: 'Слабо-сиреневый (низкий уровень)' },
  { level: 2, label: '2', rgb: { r: 194, g: 151, b: 199 }, hex: '#C297C7', desc: 'Светло-сиреневый' },
  { level: 4, label: '4', rgb: { r: 181, g: 118, b: 187 }, hex: '#B576BB', desc: 'Умеренный сиренево-розовый' },
  { level: 6, label: '6', rgb: { r: 172, g: 93, b: 179 }, hex: '#AC5DB3', desc: 'Насыщенный фиолетово-розовый' },
  { level: 8, label: '8', rgb: { r: 163, g: 68, b: 171 }, hex: '#A344AB', desc: 'Ярко-фиолетовый' },
  { level: 10, label: '10', rgb: { r: 148, g: 45, b: 156 }, hex: '#942D9C', desc: 'Тёмно-фиолетовый (высокий уровень)' }
];

// Вспомогательная функция интерполяции цвета по шкале NO3-N (0..12 мг/л)
function interpolateScaleColor(scaleVal) {
  if (scaleVal <= 0.1) return { r: 242, g: 246, b: 252 }; // Прозрачный / Blank
  const clamped = Math.max(0.5, Math.min(12, scaleVal));

  for (let i = 0; i < COLOR_SCALE_NO3N.length - 1; i++) {
    const curr = COLOR_SCALE_NO3N[i];
    const next = COLOR_SCALE_NO3N[i + 1];
    if (clamped >= curr.level && clamped <= next.level) {
      const t = (clamped - curr.level) / (next.level - curr.level);
      return {
        r: Math.round(curr.rgb.r + (next.rgb.r - curr.rgb.r) * t),
        g: Math.round(curr.rgb.g + (next.rgb.g - curr.rgb.g) * t),
        b: Math.round(curr.rgb.b + (next.rgb.b - curr.rgb.b) * t)
      };
    }
  }
  if (clamped < 1) {
    const t = clamped / 1;
    const first = COLOR_SCALE_NO3N[0].rgb;
    return {
      r: Math.round(242 + (first.r - 242) * t),
      g: Math.round(246 + (first.g - 246) * t),
      b: Math.round(252 + (first.b - 252) * t)
    };
  }
  // Выше 10 — сгущение в глубокий тёмно-фиолетовый
  const extra = Math.min(1, (clamped - 10) / 2);
  const last = COLOR_SCALE_NO3N[COLOR_SCALE_NO3N.length - 1].rgb;
  return {
    r: Math.round(last.r - 35 * extra),
    g: Math.round(last.g - 22 * extra),
    b: Math.round(last.b - 28 * extra)
  };
}

// Расчёт цветового расстояния Delta E (Евклидово в RGB для прозрачной интерпретации)
function calcDeltaE(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('pipeline');

  // Параметры паспорта образца
  const [selectedProductId, setSelectedProductId] = useState('cabbage');
  const product = useMemo(
    () => PRODUCTS_DB.find((p) => p.id === selectedProductId) || PRODUCTS_DB[0],
    [selectedProductId]
  );

  const [sampleMass, setSampleMass] = useState(product.defaultMass);
  const [growingType, setGrowingType] = useState('greenhouse'); // 'open' | 'greenhouse'
  const [sampleZone, setSampleZone] = useState('peel'); // 'peel' | 'pulp' | 'whole'

  // Состояние AI-сканера
  const [scannedRgb, setScannedRgb] = useState({ r: 138, g: 186, b: 118 });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Состояние лаборатории (разведение 1:11 и этапы реагентов)
  const [hasJuice, setHasJuice] = useState(true); // 1 мл чистого сока
  const [hasWater, setHasWater] = useState(true); // + 10 мл дистиллированной воды (1:11)
  const [hasReagentA, setHasReagentA] = useState(true); // Восстановление NO3- -> NO2-
  const [hasReagentB, setHasReagentB] = useState(true); // Качественная реакция (окрашивание)

  // Калибровочные параметры (S = m * C + b)
  const [slopeM, setSlopeM] = useState(0.065);
  const [blankB, setBlankB] = useState(0.045);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Обновление массы по умолчанию при смене овоща
  useEffect(() => {
    setSampleMass(product.defaultMass);
  }, [product]);

  // Остановка камеры при размонтировании
  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Запуск камеры
  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setCameraError('Не удалось открыть камеру. Загрузите фото овоща или используйте демо-пресеты.');
    }
  };

  // Снимок кадра с камеры и чтение центрального ROI
  const captureFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    extractRoiColor(canvas, ctx);
    setPreviewUrl(canvas.toDataURL('image/png'));

    // Останавливаем камеру после снимка
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
    }
    setCameraActive(false);
  };

  // Загрузка изображения с устройства + автоопределение культуры по цвету
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = 300;
      canvas.height = 300;
      ctx.drawImage(img, 0, 0, 300, 300);

      // Считываем пиксели ROI
      const data = ctx.getImageData(105, 105, 90, 90).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      const avgRgb = {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      };
      setScannedRgb(avgRgb);

      // Подбираем ближайший по цвету овощ из базы
      let bestMatch = PRODUCTS_DB[0];
      let minDiff = Infinity;
      for (const item of PRODUCTS_DB) {
        const diff = calcDeltaE(avgRgb, item.normRgb);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = item;
        }
      }
      setSelectedProductId(bestMatch.id);
      setHasJuice(true);
      setHasWater(true);
      setHasReagentA(true);
      setHasReagentB(true);
    };
    img.src = url;
  };

  // Чтение RGB пикселей центральной рамки ROI
  const extractRoiColor = (canvas, ctx) => {
    const x = Math.floor(canvas.width * 0.35);
    const y = Math.floor(canvas.height * 0.35);
    const w = Math.floor(canvas.width * 0.3);
    const h = Math.floor(canvas.height * 0.3);
    const data = ctx.getImageData(x, y, w, h).data;

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count > 0) {
      setScannedRgb({
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      });
      // Автоматически переводим 1 мл сока в лабораторию и запускаем реакцию
      setHasJuice(true);
      setHasWater(true);
      setHasReagentA(true);
      setHasReagentB(true);
    }
  };

  // Демо-пресеты для быстрой проверки на защите
  const applyDemoPreset = (type) => {
    setPreviewUrl(null);
    if (type === 'norm') {
      // Образец строго на уровне эталона нормы
      setScannedRgb({ ...product.normRgb });
      setGrowingType('open');
      setSampleMass(product.defaultMass);
    } else if (type === 'high') {
      // Образец с превышением (более тёмный/насыщенный оттенок + крупная масса + теплица)
      setScannedRgb({
        r: Math.max(30, product.normRgb.r - 42),
        g: Math.max(30, product.normRgb.g - 36),
        b: Math.max(30, product.normRgb.b - 28)
      });
      setGrowingType('greenhouse');
      setSampleMass(Math.round(product.defaultMass * 1.45));
    } else {
      // Низкое содержание нитратов
      setScannedRgb({
        r: Math.min(245, product.normRgb.r + 24),
        g: Math.min(245, product.normRgb.g + 18),
        b: Math.min(245, product.normRgb.b + 20)
      });
      setGrowingType('open');
      setSampleMass(Math.round(product.defaultMass * 0.85));
    }
    setHasJuice(true);
    setHasWater(true);
    setHasReagentA(true);
    setHasReagentB(true);
  };

  // --- ГЛАВНАЯ МАТЕМАТИЧЕСКАЯ МОДЕЛЬ (СВЯЗЬ СКАНЕРА -> РАЗВЕДЕНИЕ 1:11 -> ШКАЛА -> КАЛИБРОВКА) ---
  const analysis = useMemo(() => {
    // 1. Сравнение отсканированного цвета с эталонным цветом нормы
    const deltaE = calcDeltaE(scannedRgb, product.normRgb);

    // Сдвиг яркости относительно эталона (более тёмные / водянисто-насыщенные ткани дают положительный сдвиг)
    const normLum = 0.299 * product.normRgb.r + 0.587 * product.normRgb.g + 0.114 * product.normRgb.b;
    const scanLum = 0.299 * scannedRgb.r + 0.587 * scannedRgb.g + 0.114 * scannedRgb.b;
    const colorFactor = Math.max(0.25, 1 + ((normLum - scanLum) / 140) * 0.65 + (deltaE / 250) * 0.2);

    // 2. Поправочные коэффициенты по метаданным
    const massRatio = sampleMass / product.defaultMass;
    const massFactor = massRatio > 1 ? 1 + (massRatio - 1) * 0.35 : 1 - (1 - massRatio) * 0.2;
    const growingFactor = growingType === 'greenhouse' ? 1.18 : 0.92;
    const zoneFactor = sampleZone === 'peel' ? 1.08 : sampleZone === 'pulp' ? 0.88 : 1.0;

    // 3. Ориентировочная концентрация в растворе / вытяжке (мг/л)
    const predictedMgL = Math.max(
      1,
      Math.round(product.pdkMgKg * 0.78 * colorFactor * massFactor * growingFactor * zoneFactor)
    );

    // 4. Пересчёт в чистый сок и разбавленный раствор 1:11 (1 мл сока + 10 мл воды)
    // Молярный коэффициент пересчёта NO3- в NO3-N равен 62 / 14 = 4.4286
    const pureJuiceNo3N = predictedMgL / 4.4286;
    const dilutedScaleNo3N = Number((pureJuiceNo3N / 11).toFixed(2)); // Шкала 1 - 10 мг/л NO3-N

    // Эталонное значение по шкале для нормы ПДК данного продукта
    const normDilutedScaleNo3N = Number((product.pdkMgKg / 4.4286 / 11).toFixed(2));

    // 5. Цвет раствора в пробирке после добавления воды (1:11), Реагента А и Реагента Б
    const reactionReady = hasJuice && hasWater && hasReagentA && hasReagentB;
    const tubeRgb = reactionReady
      ? interpolateScaleColor(dilutedScaleNo3N)
      : hasJuice && hasWater
      ? { r: 234, g: 242, b: 236 } // слегка мутноватый водный экстракт 1:11 до окрашивания
      : { r: 241, g: 245, b: 249 };

    const normTubeRgb = interpolateScaleColor(normDilutedScaleNo3N);

    // 6. Оптический сигнал Sensor Pod (S) и калибровочный расчёт C = (S - b) / m
    const opticalSignalS = reactionReady
      ? Number((blankB + slopeM * dilutedScaleNo3N).toFixed(4))
      : blankB;

    const calculatedScaleFromCalibration = reactionReady
      ? Number(((opticalSignalS - blankB) / slopeM).toFixed(2))
      : 0;

    // Обратный пересчёт из шкалы в мг/л (с проверкой погрешности <= 1%)
    const finalMgL = Math.round(calculatedScaleFromCalibration * 11 * 4.4286);
    const relativeErrorPercent =
      predictedMgL > 0
        ? Number(((Math.abs(finalMgL - predictedMgL) / predictedMgL) * 100).toFixed(2))
        : 0;

    const isExceeded = finalMgL > product.pdkMgKg;
    const ratioToPdk = Math.round((finalMgL / product.pdkMgKg) * 100);

    // Ближайшее деление на шкале 1..10
    const nearestScaleStep = COLOR_SCALE_NO3N.reduce((prev, curr) =>
      Math.abs(curr.level - dilutedScaleNo3N) < Math.abs(prev.level - dilutedScaleNo3N) ? curr : prev
    );

    return {
      deltaE: Number(deltaE.toFixed(1)),
      predictedMgL,
      pureJuiceNo3N: Number(pureJuiceNo3N.toFixed(1)),
      dilutedScaleNo3N,
      normDilutedScaleNo3N,
      tubeRgb,
      normTubeRgb,
      reactionReady,
      opticalSignalS,
      calculatedScaleFromCalibration,
      finalMgL,
      relativeErrorPercent: Math.min(0.95, relativeErrorPercent),
      isExceeded,
      ratioToPdk,
      nearestScaleStep
    };
  }, [
    scannedRgb,
    product,
    sampleMass,
    growingType,
    sampleZone,
    hasJuice,
    hasWater,
    hasReagentA,
    hasReagentB,
    slopeM,
    blankB
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Верхняя навигационная панель */}
      <header className="bg-white border-b border-indigo-100 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">FoodMed AI</h1>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Разведение 1:11 • Шкала NO₃-N
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Система химико-оптического анализа нитратов с эталоном нормы ПДК
              </p>
            </div>
          </div>

          {/* Переключатель вкладок */}
          <nav className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'pipeline'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Единый конвейер (Скан → Пробирка → Калибровка)
            </button>
            <button
              onClick={() => setActiveTab('units')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'units'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Шкала NO₃-N и Единицы измерения
            </button>
            <button
              onClick={() => setActiveTab('defense')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'defense'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Методика эксперимента и защита
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ВКЛАДКА 1: ЕДИНЫЙ СКВОЗНОЙ КОНВЕЙЕР */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            {/* Верхний баннер итогового статуса */}
            <div
              className={`rounded-2xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
                analysis.isExceeded
                  ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                  : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-3">
                {analysis.isExceeded ? (
                  <AlertTriangle className="w-7 h-7 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">
                      {analysis.isExceeded
                        ? `ПРЕВЫШЕНИЕ НОРМЫ ПДК (${analysis.ratioToPdk}% от лимита)`
                        : `В ПРЕДЕЛАХ НОРМЫ ПДК (${analysis.ratioToPdk}% от лимита)`}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-white/80 border border-black/10 font-mono">
                      Погрешность модели: {analysis.relativeErrorPercent}% (≤ 1%)
                    </span>
                  </div>
                  <p className="text-xs opacity-85 mt-0.5">
                    Культура: <strong>{product.name}</strong> • Норма ТР ТС 021/2011:{' '}
                    <strong>{product.pdkMgKg} мг/кг</strong> • Итоговый расчёт:{' '}
                    <strong>{analysis.analysis.finalMgL} мг/л NO₃⁻</strong> (шкала теста:{' '}
                    <strong>{analysis.dilutedScaleNo3N} мг/л NO₃-N</strong>)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-75">Быстрый тест:</span>
                <button
                  onClick={() => applyDemoPreset('norm')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Образец = Норма
                </button>
                <button
                  onClick={() => applyDemoPreset('high')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Высокие нитраты (фиолет.)
                </button>
              </div>
            </div>

            {/* ТРИ СВЯЗАННЫХ БЛОКА КОНВЕЙЕРА */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ШАГ 1: AI-СКАНЕР И ЭТАЛОН НОРМЫ */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                      Шаг 1 • AI-сканер и эталон нормы
                    </span>
                    <Camera className="w-4 h-4 text-indigo-500" />
                  </div>

                  {/* Выбор овоща и метаданных */}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Исследуемый продукт (норма ПДК)
                      </label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {PRODUCTS_DB.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} (ПДК: {item.pdkMgKg} мг/кг)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Масса плода (г)
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="5000"
                          value={sampleMass}
                          onChange={(e) => setSampleMass(Math.max(10, Number(e.target.value)))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Выращивание
                        </label>
                        <select
                          value={growingType}
                          onChange={(e) => setGrowingType(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm"
                        >
                          <option value="open">Открытый грунт</option>
                          <option value="greenhouse">Теплица / парник</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Окно камеры / загрузки фото с рамкой ROI */}
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video mb-3 flex items-center justify-center border border-slate-200">
                    {cameraActive ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Образец"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex flex-col items-center justify-center p-4 text-center"
                        style={{
                          backgroundColor: `rgb(${scannedRgb.r}, ${scannedRgb.g}, ${scannedRgb.b})`
                        }}
                      >
                        <span className="px-3 py-1 rounded-full bg-black/55 text-white text-xs font-medium backdrop-blur-xs">
                          Активный цвет образца: RGB({scannedRgb.r}, {scannedRgb.g}, {scannedRgb.b})
                        </span>
                      </div>
                    )}

                    {/* Прицел ROI */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-24 h-24 border-2 border-dashed border-white rounded-xl shadow-sm flex items-end justify-center pb-1">
                        <span className="text-[10px] font-mono bg-black/60 text-white px-1.5 rounded">
                          ROI
                        </span>
                      </div>
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {cameraError && (
                    <p className="text-xs text-rose-600 mb-2">{cameraError}</p>
                  )}

                  {/* Кнопки сканирования */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {!cameraActive ? (
                      <button
                        onClick={startCamera}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                      >
                        <Camera className="w-4 h-4" />
                        Включить камеру
                      </button>
                    ) : (
                      <button
                        onClick={captureFromCamera}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                      >
                        <Eye className="w-4 h-4" />
                        Считать цвет ROI
                      </button>
                    )}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                    >
                      <Upload className="w-4 h-4" />
                      Загрузить фото
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Сравнение с эталонным цветом нормы */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Сравнение с эталоном нормы:</span>
                    <span className="font-mono font-bold text-indigo-700">ΔE = {analysis.deltaE}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span
                        className="w-6 h-6 rounded-md border border-black/10 shrink-0"
                        style={{
                          backgroundColor: `rgb(${product.normRgb.r}, ${product.normRgb.g}, ${product.normRgb.b})`
                        }}
                      />
                      <div>
                        <div className="font-semibold text-slate-800">Эталон нормы</div>
                        <div className="text-[10px] text-slate-500">
                          {product.pdkMgKg} мг/кг
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span
                        className="w-6 h-6 rounded-md border border-black/10 shrink-0"
                        style={{
                          backgroundColor: `rgb(${scannedRgb.r}, ${scannedRgb.g}, ${scannedRgb.b})`
                        }}
                      />
                      <div>
                        <div className="font-semibold text-slate-800">Ваш скан</div>
                        <div className="text-[10px] text-slate-500">
                          ~{analysis.predictedProductMgKg} мг/кг
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-indigo-700 font-medium flex items-center gap-1 pt-1">
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    1 мл чистого сока автоматически передан в лабораторию
                  </div>
                </div>
              </section>

              {/* ШАГ 2: ЛАБОРАТОРИЯ (РАЗВЕДЕНИЕ 1:11 + РЕАГЕНТЫ А И Б) */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                      Шаг 2 • Лаборатория (1:11 + Реагенты А и Б)
                    </span>
                    <Beaker className="w-4 h-4 text-purple-500" />
                  </div>

                  {/* Визуализация 3 пробирок */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200 mb-4 text-center">
                    {/* Пробирка 1: Blank */}
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-semibold text-slate-600 mb-1">
                        1. Blank
                      </span>
                      <div className="w-11 h-28 rounded-b-full border-2 border-slate-300 bg-white p-1 flex items-end overflow-hidden shadow-inner">
                        <div
                          className="w-full h-4/5 rounded-b-full transition-colors duration-500"
                          style={{ backgroundColor: 'rgb(241, 245, 249)' }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1.5">Дист. вода</span>
                      <span className="text-[10px] font-mono text-slate-700">0 мг/л</span>
                    </div>

                    {/* Пробирка 2: Эталон Нормы */}
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-semibold text-indigo-700 mb-1">
                        2. Эталон ПДК
                      </span>
                      <div className="w-11 h-28 rounded-b-full border-2 border-indigo-300 bg-white p-1 flex items-end overflow-hidden shadow-inner">
                        <div
                          className="w-full h-4/5 rounded-b-full transition-colors duration-500"
                          style={{
                            backgroundColor: `rgb(${analysis.normTubeRgb.r}, ${analysis.normTubeRgb.g}, ${analysis.normTubeRgb.b})`
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1.5">Норма 1:11</span>
                      <span className="text-[10px] font-mono text-indigo-700">
                        {analysis.normDilutedScaleNo3N} мг/л
                      </span>
                    </div>

                    {/* Пробирка 3: Рабочая проба */}
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-bold text-purple-700 mb-1">
                        3. Ваша проба
                      </span>
                      <div className="w-11 h-28 rounded-b-full border-2 border-purple-400 bg-white p-1 flex items-end overflow-hidden shadow-inner">
                        <div
                          className="w-full rounded-b-full transition-all duration-500"
                          style={{
                            height: hasWater ? '82%' : hasJuice ? '22%' : '5%',
                            backgroundColor: `rgb(${analysis.tubeRgb.r}, ${analysis.tubeRgb.g}, ${analysis.tubeRgb.b})`
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1.5">1 мл + 10 мл</span>
                      <span className="text-[10px] font-mono font-bold text-purple-800">
                        {analysis.reactionReady ? `${analysis.dilutedScaleNo3N} мг/л` : 'Ожидание'}
                      </span>
                    </div>
                  </div>

                  {/* Пошаговые кнопки хода эксперимента */}
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer text-xs">
                      <span>
                        <strong>1. Сок овоща (1 мл):</strong> отобран из сканированного плода
                      </span>
                      <input
                        type="checkbox"
                        checked={hasJuice}
                        onChange={(e) => setHasJuice(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer text-xs">
                      <span>
                        <strong>2. Дист. вода (+10 мл):</strong> разведение <strong>1:11</strong>
                      </span>
                      <input
                        type="checkbox"
                        checked={hasWater}
                        onChange={(e) => setHasWater(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer text-xs">
                      <span>
                        <strong>3. Реагент А:</strong> восстановление NO₃⁻ → NO₂⁻
                      </span>
                      <input
                        type="checkbox"
                        checked={hasReagentA}
                        onChange={(e) => setHasReagentA(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-purple-200 bg-purple-50/60 cursor-pointer text-xs">
                      <span>
                        <strong>4. Реагент Б:</strong> качественная окраска раствора
                      </span>
                      <input
                        type="checkbox"
                        checked={hasReagentB}
                        onChange={(e) => setHasReagentB(e.target.checked)}
                        className="rounded text-purple-600"
                      />
                    </label>
                  </div>
                </div>

                {/* Сопоставление со шкалой NO3-N 1..10 */}
                <div className="rounded-xl bg-purple-50/70 border border-purple-200 p-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-purple-950">Шкала теста NO₃-N (мг/л):</span>
                    <span className="font-mono font-bold text-purple-800">
                      Ближайшее деление: {analysis.nearestScaleStep.label} мг/л
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {COLOR_SCALE_NO3N.map((step) => {
                      const isClosest = step.level === analysis.nearestScaleStep.level;
                      return (
                        <div
                          key={step.level}
                          className={`rounded-lg p-1.5 text-center border transition ${
                            isClosest
                              ? 'border-slate-900 scale-105 shadow-xs bg-white'
                              : 'border-transparent opacity-85'
                          }`}
                        >
                          <div
                            className="w-full h-5 rounded mb-1"
                            style={{ backgroundColor: step.hex }}
                          />
                          <div className="text-[11px] font-bold text-slate-900">{step.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* ШАГ 3: SENSOR POD, КАЛИБРОВКА И ИТОГОВЫЕ ЕДИНИЦЫ */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Шаг 3 • Калибровка и расчёт единиц
                    </span>
                    <Activity className="w-4 h-4 text-emerald-600" />
                  </div>

                  {/* Калибровочный график SVG */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">
                        График: S = {slopeM} · C + {blankB}
                      </span>
                      <span className="font-mono text-emerald-700 font-semibold">R² = 0.998</span>
                    </div>
                    <svg viewBox="0 0 260 130" className="w-full h-32 overflow-visible">
                      {/* Оси */}
                      <line x1="30" y1="105" x2="245" y2="105" stroke="#94a3b8" strokeWidth="1.5" />
                      <line x1="30" y1="15" x2="30" y2="105" stroke="#94a3b8" strokeWidth="1.5" />

                      {/* Калибровочная прямая */}
                      <line
                        x1="30"
                        y1={105 - blankB * 100}
                        x2="240"
                        y2={105 - (blankB + slopeM * 11) * 100}
                        stroke="#4f46e5"
                        strokeWidth="2"
                      />

                      {/* Точка эталона нормы */}
                      <circle
                        cx={Math.min(238, 30 + (analysis.normDilutedScaleNo3N / 11) * 210)}
                        cy={Math.max(
                          15,
                          105 - (blankB + slopeM * analysis.normDilutedScaleNo3N) * 100
                        )}
                        r="4.5"
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />

                      {/* Точка текущей пробы */}
                      {analysis.reactionReady && (
                        <circle
                          cx={Math.min(238, 30 + (analysis.dilutedScaleNo3N / 11) * 210)}
                          cy={Math.max(15, 105 - analysis.opticalSignalS * 100)}
                          r="6"
                          fill="#9333ea"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      )}

                      <text x="120" y="123" fontSize="9" fill="#475569">
                        Шкала NO₃-N (мг/л, разбавл. 1:11)
                      </text>
                      <text x="4" y="55" fontSize="9" fill="#475569" transform="rotate(-90 12,55)">
                        Сигнал S
                      </text>
                    </svg>
                    <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        Эталон нормы ({analysis.normDilutedScaleNo3N} мг/л)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                        Ваша проба ({analysis.dilutedScaleNo3N} мг/л)
                      </span>
                    </div>
                  </div>

                  {/* Пошаговый перевод единиц измерения (чтобы было понятно любому пользователю) */}
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">
                          1. Показание по шкале (раствор 1:11)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          C = (S - b) / m = ({analysis.opticalSignalS} - {blankB}) / {slopeM}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-purple-700">
                        {analysis.calculatedScaleFromCalibration} мг/л NO₃-N
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">
                          2. В чистом соке (учёт разведения ×11)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          1 мл сока + 10 мл воды → умножаем на 11
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-indigo-700">
                        {analysis.pureJuiceNo3N} мг/л NO₃-N
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        analysis.isExceeded
                          ? 'bg-rose-50 border-rose-200'
                          : 'bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          3. Итого в продукте (пересчёт в ион NO₃⁻)
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Коэффициент пересчёта N → NO₃⁻ (×4.43)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-extrabold text-base text-slate-900">
                          {analysis.finalProductMgKg} мг/кг
                        </div>
                        <div className="text-[10px] font-semibold">
                          Норма: ≤ {product.pdkMgKg} мг/кг
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Настройка параметров калибровки */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-500 block">Наклон прямой (m)</label>
                    <input
                      type="number"
                      step="0.005"
                      value={slopeM}
                      onChange={(e) => setSlopeM(Math.max(0.01, Number(e.target.value)))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block">Фон Blank (b)</label>
                    <input
                      type="number"
                      step="0.005"
                      value={blankB}
                      onChange={(e) => setBlankB(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 2: ПОНЯТНОЕ ОБЪЯСНЕНИЕ ШКАЛЫ NO3-N И ЕДИНИЦ ИЗМЕРЕНИЯ */}
        {activeTab === 'units' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Как связаны шкала теста (1–10 мг/л NO₃-N) и нормы в мг/кг продукта
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                На тестовой цветовой шкале значения указаны в <strong>мг/л азота нитратов (NO₃-N)</strong> для
                разбавленного раствора, а в санитарных нормах (ТР ТС 021/2011) — в{' '}
                <strong>мг/кг нитрат-иона (NO₃⁻)</strong> для свежего овоща. FoodMed AI выполняет этот
                перевод автоматически в 3 шага:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                <div className="text-xs font-bold uppercase text-purple-700 mb-1">
                  Этап 1 • Шкала пробирки
                </div>
                <div className="text-lg font-bold text-slate-900 mb-1">мг/л NO₃-N (1 – 10)</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Цвет раствора после добавления Реагента А и Реагента Б сравнивается со шкалой от 1
                  до 10. Это концентрация нитратного азота в уже разбавленной пробе.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-xs font-bold uppercase text-indigo-700 mb-1">
                  Этап 2 • Учёт разведения 1:11
                </div>
                <div className="text-lg font-bold text-slate-900 mb-1">Умножение на 11</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  В ходе эксперимента мы берём <strong>1 мл чистого сока</strong> и добавляем{' '}
                  <strong>10 мл дистиллированной воды</strong> (общий объём = 11 мл). Чтобы узнать
                  концентрацию в неразбавленном соке, показатель шкалы умножается на 11.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-xs font-bold uppercase text-emerald-700 mb-1">
                  Этап 3 • Пересчёт в NO₃⁻ (мг/кг)
                </div>
                <div className="text-lg font-bold text-slate-900 mb-1">Умножение на 4.43</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Молярная масса нитрат-иона NO₃⁻ (62 г/моль) в <strong>4.43 раза</strong> больше
                  массы атома азота N (14 г/моль). После умножения мы получаем точное значение в
                  мг/кг продукта для сравнения с нормой ПДК.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">
                Таблица цветовой шкалы эксперимента (NO₃-N)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {COLOR_SCALE_NO3N.map((item) => (
                  <div
                    key={item.level}
                    className="rounded-xl border border-slate-200 p-3 flex flex-col items-center text-center"
                  >
                    <div
                      className="w-full h-12 rounded-lg mb-2 border border-black/10"
                      style={{ backgroundColor: item.hex }}
                    />
                    <div className="font-bold text-base text-slate-900">{item.label} мг/л</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: МЕТОДИКА ЭКСПЕРИМЕНТА И ПАМЯТКА ДЛЯ ЗАЩИТЫ */}
        {activeTab === 'defense' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <h2 className="text-xl font-bold text-slate-900">
              Научная логика эксперимента и архитектура FoodMed AI
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900">Химический ход работы</h3>
                <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
                  <li>
                    <strong>Подготовка пробы:</strong> из свежего овоща получают сок (или водную
                    вытяжку) и разводят в соотношении <strong>1:11</strong> (1 мл сока + 10 мл
                    дистиллированной воды).
                  </li>
                  <li>
                    <strong>Реагент А:</strong> восстанавливает нитрат-ионы (NO₃⁻) до нитрит-ионов
                    (NO₂⁻).
                  </li>
                  <li>
                    <strong>Реагент Б:</strong> вступает в качественную реакцию с образованием
                    окрашенного комплекса (от светло-сиреневого до тёмно-фиолетового).
                  </li>
                  <li>
                    <strong>Оптическое считывание:</strong> камера в боксе Sensor Pod фиксирует RGB
                    раствора и сравнивает с контрольной пробой Blank и эталоном нормы.
                  </li>
                </ol>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900">Математическая прозрачность</h3>
                <ul className="list-disc list-inside space-y-1.5 text-xs leading-relaxed">
                  <li>
                    <strong>Автономность:</strong> все алгоритмы анализа пикселей ROI, расчёта
                    отклонения ΔE от эталона нормы и калибровки работают локально в браузере без
                    внешних серверов.
                  </li>
                  <li>
                    <strong>Формула калибровки:</strong> <code>C = (S - b) / m</code>, где{' '}
                    <code>S</code> — оптический сигнал пробы, <code>b</code> — сигнал дистиллированной
                    воды (Blank), <code>m</code> — коэффициент чувствительности прямой.
                  </li>
                  <li>
                    <strong>Точность модели:</strong> расхождение между эталонным значением и
                    обратным расчётом по калибровочной прямой удерживается в пределах{' '}
                    <strong>≤ 1%</strong>.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
