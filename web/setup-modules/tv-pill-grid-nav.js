(function () {
  'use strict';

  // ArrowUp/Down/Left/Right movement between catalog pills in the
  // #step-2 grids (.s2-cat-pills is a real 2-column CSS grid; #s2RawPills
  // shares the same layout). Column count is read from the grid itself so
  // this keeps working if the layout's column count ever changes.
  var GRID_CONTAINER_SELECTOR = '.s2-cat-pills, #s2RawPills';
  var ITEM_SELECTOR = '.s2-pill';
  var ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

  document.addEventListener('keydown', function (event) {
    if (ARROWS.indexOf(event.key) === -1) return;

    var target = event.target;
    if (!target || !target.matches || !target.matches(ITEM_SELECTOR)) return;

    var grid = target.closest(GRID_CONTAINER_SELECTOR);
    if (!grid) return;

    var items = Array.prototype.filter.call(
      grid.querySelectorAll(ITEM_SELECTOR),
      isVisible
    );
    var idx = items.indexOf(target);
    if (idx === -1) return;

    var cols = 1;
    try {
      var colStyle = window.getComputedStyle(grid).gridTemplateColumns;
      if (colStyle && colStyle !== 'none') {
        cols = colStyle.trim().split(/\s+/).length || 1;
      }
    } catch (error) {
      cols = 2;
    }

    var next = -1;
    if (event.key === 'ArrowRight') next = idx + 1;
    else if (event.key === 'ArrowLeft') next = idx - 1;
    else if (event.key === 'ArrowDown') next = idx + cols;
    else if (event.key === 'ArrowUp') next = idx - cols;

    if (next >= 0 && next < items.length) {
      event.preventDefault();
      items[next].focus();
    }
  });
})();
