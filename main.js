function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

fetch('changelog.json')
  .then(function(res) { return res.json(); })
  .then(function(data) {
    var container = document.getElementById('changelog-list');
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#a0aec0;font-size:13px;">暂无更新记录</p>';
      return;
    }
    container.innerHTML = data.map(function(item) {
      var changeItems = (item.changes || []).map(function(c) {
        return '<li>' + escapeHtml(c) + '</li>';
      }).join('');
      return '<div class="changelog-item">'
        + '<div class="changelog-header">'
        + '<span class="changelog-version">v' + escapeHtml(item.version) + '</span>'
        + '<span class="changelog-date">' + escapeHtml(item.date) + '</span>'
        + '</div>'
        + '<ul class="changelog-changes">' + changeItems + '</ul>'
        + '</div>';
    }).join('');
  })
  .catch(function() {
    document.getElementById('changelog-list').innerHTML =
      '<p style="text-align:center;color:#fc8181;font-size:13px;">日志加载失败</p>';
  });

document.querySelectorAll('.copy-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var text = btn.getAttribute('data-copy');
    navigator.clipboard.writeText(text).then(function() {
      btn.classList.add('copied');
      var origTitle = btn.title;
      btn.title = '已复制！';
      setTimeout(function() {
        btn.classList.remove('copied');
        btn.title = origTitle;
      }, 1500);
    });
  });
});
