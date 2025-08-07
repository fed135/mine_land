<script>
	import { onMount } from 'svelte';

	let canvas = $state();
	let ctx = $state();

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			resizeCanvas();
			startRenderLoop();
			window.addEventListener('resize', resizeCanvas);
			
			return () => {
				window.removeEventListener('resize', resizeCanvas);
			};
		}
	});

	function resizeCanvas() {
		if (canvas) {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		}
	}

	function startRenderLoop() {
		function render() {
			if (ctx && canvas) {
				ctx.fillStyle = 'red';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}
			requestAnimationFrame(render);
		}
		render();
	}
</script>

<canvas bind:this={canvas}></canvas>

<style>
	canvas {
		display: block;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
	}
</style>
