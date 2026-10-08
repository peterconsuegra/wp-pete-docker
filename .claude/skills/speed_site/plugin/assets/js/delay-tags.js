/* __NAME__: third-party tags after the first interaction. Held-back scripts are type="text/plain"
   with data-__PREFIX__-delay (external ones keep their URL in data-__PREFIX__-src). On the first tap,
   scroll, key, wheel or mouse move, or 10 s after load, they run in their original order. */
(function () {
	var events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel', 'mousemove'];
	var opts = { passive: true };
	var started = false;
	function run() {
		if (started) return;
		started = true;
		events.forEach(function (e) { removeEventListener(e, run, opts); });
		var chain = Promise.resolve();
		[].slice.call(document.querySelectorAll('script[data-__PREFIX__-delay]')).forEach(function (old) {
			chain = chain.then(function () {
				return new Promise(function (done) {
					var s = document.createElement('script');
					[].forEach.call(old.attributes, function (a) {
						if (!/^(type|data-__PREFIX__-delay|data-__PREFIX__-src)$/.test(a.name)) s.setAttribute(a.name, a.value);
					});
					var src = old.getAttribute('data-__PREFIX__-src');
					if (src) { s.async = false; s.onload = s.onerror = function () { done(); }; s.src = src; }
					else s.text = old.text;
					old.parentNode.replaceChild(s, old);
					if (!src) done();
				});
			});
		});
	}
	events.forEach(function (e) { addEventListener(e, run, opts); });
	addEventListener('load', function () { setTimeout(run, 10000); });
})();
