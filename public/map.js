let map, userMarker, radius = 500;
let toiletMarkers = [];
let userLat = null, userLng = null;
let votedToilets = JSON.parse(localStorage.getItem('voted') || '{}');

// 지도 초기화
function initMap() {
  map = L.map('map').setView([37.2636, 127.0286], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  getLocation();
}

// 현재 위치 가져오기
function getLocation() {
  const status = document.getElementById('loc-status');

  if (!navigator.geolocation) {
    showManualSearch();
    return;
  }

  status.textContent = '🏁위치 확인 중...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      status.textContent = '🏁 현재 위치';
      setLocation(userLat, userLng);
      document.getElementById('manual-search').style.display = 'none';
    },
    err => {
      status.textContent = '🏁 위치 접근 거부됨';
      showManualSearch();
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// 수동 검색창 표시
function showManualSearch() {
  document.getElementById('manual-search').style.display = 'flex';
  document.getElementById('addr-input').focus();
}

// 주소로 위치 검색
async function searchAddress() {
  const query = document.getElementById('addr-input').value.trim();
  if (!query) return;

  const status = document.getElementById('loc-status');
  status.textContent = '🏁 주소 검색 중...';

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ko`
    );
    const data = await res.json();

    if (!data || data.length === 0) {
      alert('주소를 찾을 수 없어요. 다시 입력해주세요.');
      status.textContent = '🏁 위치 없음';
      return;
    }

    userLat = parseFloat(data[0].lat);
    userLng = parseFloat(data[0].lon);
    status.textContent = `🏁 ${query}`;
    setLocation(userLat, userLng);

    document.getElementById('manual-search').style.display = 'none';
    document.getElementById('addr-input').value = '';

  } catch (err) {
    alert('주소 검색 중 오류가 발생했어요.');
    console.error(err);
  }
}

// 위치 설정 및 지도 이동
function setLocation(lat, lng) {
  map.setView([lat, lng], 15);

  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: '#1d4ed8',
    fillOpacity: 1,
    color: 'white',
    weight: 3
  }).addTo(map).bindPopup('🏁 현재 위치');

  L.circle([lat, lng], {
    radius: radius,
    color: '#1d4ed8',
    fillColor: '#1d4ed8',
    fillOpacity: 0.05,
    weight: 1,
    dashArray: '6'
  }).addTo(map);
}

// 반경 설정
function setRadius(r, btn) {
  radius = r;
  document.querySelectorAll('.radius-btn')
    .forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// 화장실 검색
async function searchToilets() {
  if (!userLat || !userLng) {
    alert('위치를 먼저 설정해주세요.');
    showManualSearch();
    return;
  }

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.textContent = '검색 중...';

  toiletMarkers.forEach(m => m.remove());
  toiletMarkers = [];

  try {
    const res = await fetch(
      `/api/toilets?lat=${userLat}&lng=${userLng}&radius=${radius}`
    );
    const json = await res.json();

    if (!json.success) throw new Error(json.message);

    renderMarkers(json.data);
    renderList(json.data);

  } catch (err) {
    console.error(err);
    alert('검색 중 오류가 발생했습니다: ' + err.message);
  }

  btn.disabled = false;
  btn.textContent = '♿ 주변 검색';
}

// 마커 렌더링
function renderMarkers(data) {
  const icon = L.divIcon({
    html: `<div style="
      background:#1d4ed8;
      color:white;
      border-radius:50%;
      width:32px;
      height:32px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:16px;
      border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">♿</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  data.forEach((toilet, i) => {
    if (!toilet.lat || !toilet.lng) return;

    const distStr = toilet.distance < 1000
      ? `${Math.round(toilet.distance)}m`
      : `${(toilet.distance / 1000).toFixed(1)}km`;

    const marker = L.marker([toilet.lat, toilet.lng], { icon })
      .addTo(map)
      .bindPopup(`
        <div class="popup-name">♿ ${toilet.name}</div>
        <div class="popup-addr">🏁 ${toilet.address}</div>
        <div class="popup-info">
          <span>🕐 ${toilet.openTime || '정보없음'}</span>
          <span>🏢 ${toilet.management || '정보없음'}</span>
          <span>📏 ${distStr}</span>
          <span>🚹 장애인 칸: 남 ${toilet.maleDspsn} / 여 ${toilet.femaleDspsn}</span>
        </div>
        <div class="popup-votes">
          <span>👍 ${toilet.likes || 0}</span>
          <span>👎 ${toilet.dislikes || 0}</span>
        </div>
      `);

    toiletMarkers.push(marker);
  });
}

// 목록 렌더링
function renderList(data) {
  const list = document.getElementById('result-list');
  const count = document.getElementById('result-count');

  count.textContent = `${data.length}개`;

  if (data.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        ♿ 반경 내 장애인 화장실이 없어요.<br>
        반경을 넓혀서 다시 검색해 보세요.
      </div>`;
    return;
  }

  list.innerHTML = data.map((toilet, i) => {
    const distStr = toilet.distance < 1000
      ? `${Math.round(toilet.distance)}m`
      : `${(toilet.distance / 1000).toFixed(1)}km`;

    const total = (toilet.likes || 0) + (toilet.dislikes || 0);
    const likeRate = total > 0
      ? Math.round(((toilet.likes || 0) / total) * 100)
      : 0;
    const hasVoted = votedToilets[toilet.id];

    return `
      <div class="toilet-card" id="card-${toilet.id}" onclick="focusMarker(${i})">
        <div class="card-top">
          <div class="card-name">♿ ${toilet.name}</div>
          <div class="card-dist">${distStr}</div>
        </div>
        <div class="card-addr">🏁 ${toilet.address}</div>
        <div class="card-tags">
          <span class="tag tag-disabled">
            🚹 남 ${toilet.maleDspsn}칸 / 🚺 여 ${toilet.femaleDspsn}칸
          </span>
          ${toilet.management
            ? `<span class="tag tag-manager">🏢 ${toilet.management}</span>`
            : ''}
          ${toilet.openTime && toilet.openTime !== ':~:'
            ? `<span class="tag tag-open">🕐 ${toilet.openTime}</span>`
            : ''}
        </div>

        ${total > 0 ? `
        <div class="vote-gauge">
          <div class="gauge-bar">
            <div class="gauge-fill" style="width:${likeRate}%"></div>
          </div>
          <div class="gauge-label">
            <span>관리 양호 ${likeRate}%</span>
            <span>총 ${total}명 참여</span>
          </div>
        </div>` : ''}

        <div class="vote-btns" onclick="event.stopPropagation()">
          <button
            class="vote-btn like-btn ${hasVoted === 'like' ? 'voted' : ''}"
            onclick="vote('${toilet.id}', 'like', ${i})"
            ${hasVoted ? 'disabled' : ''}
          >
            👍 관리 잘 됨 <span id="likes-${toilet.id}">${toilet.likes || 0}</span>
          </button>
          <button
            class="vote-btn dislike-btn ${hasVoted === 'dislike' ? 'voted' : ''}"
            onclick="vote('${toilet.id}', 'dislike', ${i})"
            ${hasVoted ? 'disabled' : ''}
          >
            👎 관리 안 됨 <span id="dislikes-${toilet.id}">${toilet.dislikes || 0}</span>
          </button>
        </div>
      </div>`;
  }).join('');
}

// 투표
async function vote(toiletId, type, markerIndex) {
  if (votedToilets[toiletId]) return;

  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toiletId, type })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    votedToilets[toiletId] = type;
    localStorage.setItem('voted', JSON.stringify(votedToilets));

    document.getElementById(`likes-${toiletId}`).textContent = json.likes;
    document.getElementById(`dislikes-${toiletId}`).textContent = json.dislikes;

    const card = document.getElementById(`card-${toiletId}`);
    card.querySelectorAll('.vote-btn').forEach(btn => btn.disabled = true);
    card.querySelector(`.${type === 'like' ? 'like' : 'dislike'}-btn`).classList.add('voted');

    const total = json.likes + json.dislikes;
    const likeRate = total > 0 ? Math.round((json.likes / total) * 100) : 0;
    const gauge = card.querySelector('.gauge-fill');
    if (gauge) {
      gauge.style.width = `${likeRate}%`;
    } else {
      card.querySelector('.card-tags').insertAdjacentHTML('afterend', `
        <div class="vote-gauge">
          <div class="gauge-bar">
            <div class="gauge-fill" style="width:${likeRate}%"></div>
          </div>
          <div class="gauge-label">
            <span>관리 양호 ${likeRate}%</span>
            <span>총 ${total}명 참여</span>
          </div>
        </div>
      `);
    }
  } catch (err) {
    console.error(err);
    alert('투표 중 오류가 발생했습니다.');
  }
}

// 카드 클릭시 마커 포커스
function focusMarker(index) {
  const marker = toiletMarkers[index];
  if (!marker) return;
  map.setView(marker.getLatLng(), 17);
  marker.openPopup();
}

// 시작
initMap();
