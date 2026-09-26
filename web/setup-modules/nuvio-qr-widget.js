(function(){
  const DISPLAY_URL = window.location.origin;
  let qrGenerated = false;
  const toggle = document.getElementById('nuvio-qr-toggle');
  const qrDiv = document.getElementById('nuvio-qr-code');
  const qrStatus = document.getElementById('nuvio-qr-status');

  // This widget's markup (#nuvio-qr-toggle / #nuvio-qr-code / #nuvio-qr-status)
  // isn't present in the current Step 4 layout — nothing else in the page
  // creates it at runtime either, so skip wiring it up instead of throwing.
  if (!toggle || !qrDiv || !qrStatus) return;

  qrDiv.style.position = 'relative';

  toggle.addEventListener('click', function(){
    if (!window.generatedToken) {
      qrStatus.textContent = umT('setup.nuvioPushWidget.generateYourSetupFirstStep3', 'Generate your setup first (Step 4) before scanning.');
      qrStatus.style.color = '#ff6b6b';
      return;
    }

    if (qrDiv.style.display === 'none') {
      qrDiv.style.display = 'inline-block';
      qrStatus.textContent = umT('setup.nuvioPushWidget.scanWithYourPhoneCamera', 'Scan with your phone camera');
      qrStatus.style.color = 'var(--muted)';

      if (!qrGenerated) {
        new QRCode(qrDiv, {
          text: DISPLAY_URL + '/push.html?token=' + window.generatedToken,
          width: 200,
          height: 200,
          correctLevel: QRCode.CorrectLevel.H
        });

        const logoWrap = document.createElement('div');
        logoWrap.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:4px;box-shadow:0 0 0 4px #fff;';
        const logoImg = document.createElement('img');
        logoImg.src = '/icons/icon-192.png';
        logoImg.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:6px;';
        logoWrap.appendChild(logoImg);
        qrDiv.appendChild(logoWrap);

        qrGenerated = true;
      }
    } else {
      qrDiv.style.display = 'none';
      qrStatus.textContent = '';
    }
  });
})();
