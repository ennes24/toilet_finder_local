const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 로컬 파일에서 화장실 데이터 로딩
let cachedData = null;

function loadData() {
  if (cachedData) return cachedData;
  console.log('로컬 파일에서 데이터 로딩 중...');
  const raw = fs.readFileSync('toilet-data.json', 'utf8');
  cachedData = JSON.parse(raw);
  console.log('데이터 로딩 완료:', cachedData.length, '개');
  return cachedData;
}

// 투표 데이터 로딩
function loadVotes() {
  try {
    if (!fs.existsSync('votes.json')) {
      fs.writeFileSync('votes.json', '{}');
    }
    return JSON.parse(fs.readFileSync('votes.json', 'utf8'));
  } catch {
    return {};
  }
}

// 투표 데이터 저장
function saveVotes(votes) {
  fs.writeFileSync('votes.json', JSON.stringify(votes, null, 2));
}

// 서버 시작시 미리 로딩
loadData();

// 공중화장실 API
app.get('/api/toilets', (req, res) => {
  const { lat, lng, radius = 1000 } = req.query;

  try {
    const items = loadData();
    const votes = loadVotes();

    const withDistance = items.map(item => {
      const id = `${item.REFINE_WGS84_LOGT}_${item.REFINE_WGS84_LAT}`;
      const vote = votes[id] || { likes: 0, dislikes: 0 };

      return {
        id,
        name: item.PBCTLT_PLC_NM,
        address: item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR,
        lat: parseFloat(item.REFINE_WGS84_LAT),
        lng: parseFloat(item.REFINE_WGS84_LOGT),
        openTime: item.OPEN_TM_INFO,
        management: item.MANAGE_INST_NM,
        tel: item.MNGINST_TELNO,
        maleDspsn: item.MALE_DSPSN_WTRCLS_CNT,
        femaleDspsn: item.FEMALE_DSPSN_WTRCLS_CNT,
        likes: vote.likes,
        dislikes: vote.dislikes,
        distance: getDistance(
          parseFloat(lat),
          parseFloat(lng),
          parseFloat(item.REFINE_WGS84_LAT),
          parseFloat(item.REFINE_WGS84_LOGT)
        )
      };
    })
    .filter(item => !isNaN(item.lat) && !isNaN(item.lng))
    .filter(item => item.distance <= parseFloat(radius))
    .sort((a, b) => a.distance - b.distance);

    console.log('반경 내 결과:', withDistance.length, '개');
    res.json({ success: true, count: withDistance.length, data: withDistance });

  } catch (error) {
    console.error('오류:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 좋아요 / 싫어요 API
app.post('/api/vote', (req, res) => {
  const { toiletId, type } = req.body;

  if (!toiletId || !['like', 'dislike'].includes(type)) {
    return res.status(400).json({ success: false, message: '잘못된 요청' });
  }

  try {
    const votes = loadVotes();

    if (!votes[toiletId]) {
      votes[toiletId] = { likes: 0, dislikes: 0 };
    }

    if (type === 'like') {
      votes[toiletId].likes += 1;
    } else {
      votes[toiletId].dislikes += 1;
    }

    saveVotes(votes);

    res.json({
      success: true,
      likes: votes[toiletId].likes,
      dislikes: votes[toiletId].dislikes
    });

  } catch (error) {
    console.error('투표 오류:', error.message);
    res.status(500).json({ success: false, message: '투표 실패' });
  }
});

// 거리 계산
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});