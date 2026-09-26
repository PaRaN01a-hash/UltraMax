/* ULTRA MAX NATIVE REVIEW ACTIONS */
document.addEventListener('DOMContentLoaded', function () {
  var isApp =
    document.documentElement.classList.contains('um-app-mode') ||
    document.body.classList.contains('um-app-mode');

  if (!isApp) return;

  var target = document.getElementById('s2ReviewActions');
  var summary = document.querySelector('.s2-app-summary-btn');
  var preview = document.querySelector('.s2-app-preview-btn');

  if (!target || !summary || !preview) return;

  target.appendChild(summary);
  target.appendChild(preview);

  summary.style.display = 'flex';
  preview.style.display = 'flex';
});
