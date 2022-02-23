const globe = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  (document.getElementById('globe'));

// from https://github.com/telegeography/www.submarinecablemap.com
fetch('//raw.githubusercontent.com/telegeography/www.submarinecablemap.com/master/web/public/api/v3/cable/cable-geo.json')
  .then(r =>r.json())
  .then(cablesGeo => {
    let cablePaths = [];
    cablesGeo.features.forEach(({ geometry }) => {
      geometry.coordinates.forEach(coords => cablePaths.push({ coords }));
    });

    globe
      .pathsData(cablePaths)
      .pathPoints('coords')
      .pathPointLat(p => p[1])
      .pathPointLng(p => p[0])
      .pathDashLength(0.1)
      .pathDashGap(0.008)
      .pathDashAnimateTime(12000)
      .pointOfView({ lat: 39.6, lng: -98.5, altitude: 3.3 });
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 1.1;
  });
