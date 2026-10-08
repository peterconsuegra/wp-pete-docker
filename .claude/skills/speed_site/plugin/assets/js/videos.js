/* __NAME__: videos after the first paint. Server side, each <video> got data-__PREFIX__-video, its
   files in data-__PREFIX__-src and preload="none"; later posters wait in data-__PREFIX__-poster (their
   copies in data-__PREFIX__-posters). After the load event AND once the first paint is on screen,
   videos within a screen of view get them back, load, and play when the design autoplays them. */
(function () {
	var videos = [].slice.call(document.querySelectorAll('video[data-__PREFIX__-video]'));
	if (!videos.length) return;

	// The poster copy for this screen: the smallest at least as wide as the video in device pixels.
	function poster(v) {
		var url = v.getAttribute('data-__PREFIX__-poster');
		var set = v.getAttribute('data-__PREFIX__-posters');
		if (set) {
			var need = v.getBoundingClientRect().width * (window.devicePixelRatio || 1), best = null;
			set.split(',').forEach(function (c) {
				var p = c.trim().split(/\s+/), w = parseInt(p[1], 10);
				if (!best || (best.w < need ? w > best.w : (w >= need && w < best.w))) best = { u: p[0], w: w };
			});
			if (best) url = best.u;
		}
		if (url) v.setAttribute('poster', url);
	}

	function start(v) {
		if (v.getAttribute('data-__PREFIX__-done')) return;
		v.setAttribute('data-__PREFIX__-done', '1');
		poster(v);
		if (v.getAttribute('data-__PREFIX__-src')) v.setAttribute('src', v.getAttribute('data-__PREFIX__-src'));
		[].forEach.call(v.querySelectorAll('source[data-__PREFIX__-src]'), function (s) { s.setAttribute('src', s.getAttribute('data-__PREFIX__-src')); });
		v.preload = v.getAttribute('data-__PREFIX__-preload') || 'metadata';
		v.load();
		if (v.autoplay) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
	}

	// Run cb once the first contentful paint has been presented, one frame later.
	function painted(cb) {
		var done = false;
		function go() { if (done) return; done = true; requestAnimationFrame(function () { setTimeout(cb, 0); }); }
		if (performance.getEntriesByName && performance.getEntriesByName('first-contentful-paint').length) return go();
		try {
			new PerformanceObserver(function (list) { if (list.getEntriesByName('first-contentful-paint').length) go(); }).observe({ type: 'paint', buffered: true });
		} catch (e) { go(); }
		setTimeout(go, 3000); // a browser without paint timing
	}

	function watch() {
		if (!('IntersectionObserver' in window)) { videos.forEach(start); return; }
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } });
		}, { rootMargin: '100% 0px' });
		videos.forEach(function (v) { io.observe(v); });
	}

	function go() { painted(watch); }
	if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
