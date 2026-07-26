/**
 * 曲线拼图验证码 - 静态演示版
 * 无需后端依赖，纯前端实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // 配置参数
    const PUZZLE_CONFIG = {
        radius: 10,
        size: 50,
        canvasWidth: 400,
        canvasHeight: 250,
        tolerance: 5,               // 判定成功的像素误差
        resetDelay: {
            success: 3000,          // 成功后重置延迟
            failure: 1000           // 失败震动后重置延迟
        },
        curve: {
            points: 5,              // 控制点数量
            yMargin: 0.2,           // y轴边距比例（上下各预留20%）
            resolution: 100         // 每段曲线采样点数量
        }
    };

    // 性能优化配置：低配设备降低动画帧率与曲线采样密度
    const PERFORMANCE_CONFIG = {
        animationFrameRate: 60      // 辅助线动画帧率限制
    };
    if ((navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2) {
        PERFORMANCE_CONFIG.animationFrameRate = 15;
        PUZZLE_CONFIG.curve.resolution = 50;
    }

    // 背景图片加载失败时的纯色兜底
    const FALLBACK_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'];

    // 辅助线控制点的标记颜色
    const CONTROL_POINT_COLORS = [
        'rgba(255, 0, 0, 0.7)',
        'rgba(0, 255, 0, 0.7)',
        'rgba(0, 0, 255, 0.7)',
        'rgba(255, 255, 0, 0.7)',
        'rgba(255, 0, 255, 0.7)'
    ];

    const MESSAGES = {
        idle: '拖动滑块进行验证',
        success: '验证成功!',
        failure: '验证失败，请重试!'
    };

    // 状态变量
    const puzzleState = {
        isMatch: false,
        isDragging: false,
        moveX: 0,
        dragRangeX: 0,              // 滑块可移动的最大距离
        curvePath: null,
        targetX: null,
        targetY: null,
        fallbackColorIndex: 0,
        showCurveAndPoints: false,  // 是否显示曲线和控制点
        pieceReady: false           // 拼图块位图是否已生成
    };

    // 拖动时只在浏览器绘制帧中处理最新坐标，避免事件堆积。
    let dragFrameId = null;
    let pendingPointerX = null;
    let activePointerId = null;
    let curveAnimationFrameId = null;
    let curveLastPaintTime = 0;
    let curveAnimPhase = 0;
    const dragMetrics = {
        trackLeft: 0,
        maxX: 0,
        grabOffsetX: 0
    };

    // 获取DOM元素
    const $dragBtn = document.querySelector('.yan_drag_btn');
    const $dragArea = document.querySelector('.yan_drag');
    const $moved = document.querySelector('.moved');
    const $dragText = document.querySelector('.yan_drag_text');
    const $container = document.querySelector('.yan_ceng');
    const $curveToggle = document.getElementById('curve_toggle');

    const canvas = {
        img: document.getElementById('yan_img2'),
        overlay: document.getElementById('yan_ceng')
    };

    // 确保所有DOM元素存在
    if (!canvas.img || !canvas.overlay || !$dragBtn || !$dragArea || !$moved || !$dragText || !$container) {
        console.error('无法找到必要的DOM元素：', {
            'yan_img2': !!canvas.img,
            'yan_ceng(canvas)': !!canvas.overlay,
            'yan_drag_btn': !!$dragBtn,
            'yan_drag': !!$dragArea,
            'moved': !!$moved,
            'yan_drag_text': !!$dragText,
            'yan_ceng(div)': !!$container
        });
        return;
    }

    const ctx = {
        img: canvas.img.getContext('2d'),
        overlay: canvas.overlay.getContext('2d')
    };

    // 叠加层Canvas只创建一次，重置时清空复用，避免反复增删DOM节点。
    const outlineCanvas = createLayerCanvas('target_outline', 3);
    const curveCanvas = createLayerCanvas('curve_path', 4);
    const outlineCtx = outlineCanvas.getContext('2d');
    const curveCtx = curveCanvas.getContext('2d');

    // 拼图块离屏Canvas：一轮验证码只生成一次位图，拖动时直接复用。
    const pieceCanvas = document.createElement('canvas');
    pieceCanvas.width = PUZZLE_CONFIG.size * 2;
    pieceCanvas.height = PUZZLE_CONFIG.size * 2;
    const pieceCtx = pieceCanvas.getContext('2d');

    // 背景图片只加载一次，之后每轮重置直接重绘。
    const backgroundImg = new Image();
    let backgroundStatus = 'loading'; // loading | ready | failed

    initBackgroundImage();
    setupEvents();
    resetPuzzle();
    fetchGitHubStarCount();

    /**
     * 创建一个覆盖在拼图区域上的Canvas层
     */
    function createLayerCanvas(id, zIndex) {
        const layer = document.createElement('canvas');
        layer.id = id;
        layer.width = PUZZLE_CONFIG.canvasWidth;
        layer.height = PUZZLE_CONFIG.canvasHeight;
        layer.style.position = 'absolute';
        layer.style.top = '0';
        layer.style.left = '0';
        layer.style.zIndex = String(zIndex);
        layer.style.pointerEvents = 'none';
        $container.appendChild(layer);
        return layer;
    }

    /**
     * 初始化背景图片加载
     */
    function initBackgroundImage() {
        backgroundImg.onload = () => {
            backgroundStatus = 'ready';
            renderScene();
        };
        backgroundImg.onerror = () => {
            console.error('背景图片加载失败，使用纯色背景替代');
            backgroundStatus = 'failed';
            renderScene();
        };

        const bgSource = document.getElementById('yan_img');
        if (bgSource && bgSource.src) {
            backgroundImg.src = bgSource.src;
            if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
                backgroundStatus = 'ready';
            }
        } else {
            console.warn('找不到背景图片元素，使用纯色背景替代');
            backgroundStatus = 'failed';
        }
    }

    /**
     * 设置事件监听
     */
    function setupEvents() {
        // Pointer Events 同时覆盖鼠标、触控笔和触摸，并可在指针离开轨道后继续捕获。
        $dragBtn.addEventListener('pointerdown', handleDragStart);
        document.addEventListener('pointermove', handleDragMove);
        document.addEventListener('pointerup', handleDragEnd);
        document.addEventListener('pointercancel', handleDragEnd);

        if ($curveToggle) {
            $curveToggle.addEventListener('change', () => {
                puzzleState.showCurveAndPoints = $curveToggle.checked;
                if ($curveToggle.checked) {
                    drawCurvePath();
                } else {
                    removeCurvePath();
                }
            });
        }
    }

    /**
     * 处理拖动开始
     */
    function handleDragStart(e) {
        if (puzzleState.isMatch || (e.pointerType === 'mouse' && e.button !== 0)) return;

        e.preventDefault();

        const btnRect = $dragBtn.getBoundingClientRect();

        dragMetrics.trackLeft = btnRect.left - puzzleState.moveX;
        dragMetrics.maxX = Math.max(0, $dragArea.clientWidth - btnRect.width);
        dragMetrics.grabOffsetX = e.clientX - btnRect.left;

        puzzleState.isDragging = true;
        puzzleState.dragRangeX = dragMetrics.maxX;
        activePointerId = e.pointerId;
        pendingPointerX = null;

        if ($dragBtn.setPointerCapture) {
            $dragBtn.setPointerCapture(e.pointerId);
        }

        $dragBtn.classList.add('is-dragging');
        $dragBtn.textContent = '<->';
    }

    /**
     * 处理拖动移动
     */
    function handleDragMove(e) {
        if (!puzzleState.isDragging || e.pointerId !== activePointerId) return;

        e.preventDefault();
        pendingPointerX = e.clientX;

        if (dragFrameId === null) {
            dragFrameId = requestAnimationFrame(renderPendingDrag);
        }
    }

    /**
     * 在下一绘制帧中消费最新的指针坐标。
     */
    function renderPendingDrag() {
        dragFrameId = null;
        if (pendingPointerX === null || !puzzleState.isDragging) return;

        const pointerX = pendingPointerX;
        pendingPointerX = null;
        applyDragPosition(pointerX);
    }

    /**
     * 同步滑块、进度条和拼图块的位置。
     */
    function applyDragPosition(pointerX) {
        const relativeX = Math.max(
            0,
            Math.min(pointerX - dragMetrics.trackLeft - dragMetrics.grabOffsetX, dragMetrics.maxX)
        );

        puzzleState.moveX = relativeX;

        // transform 不触发布局；进度条使用 scaleX，避免逐帧修改 width。
        const progress = dragMetrics.maxX > 0 ? relativeX / dragMetrics.maxX : 0;
        $dragBtn.style.transform = `translate3d(${relativeX}px, 0, 0)`;
        $moved.style.transform = `scaleX(${progress})`;
        updatePuzzlePiece();
    }

    /**
     * 处理拖动结束
     */
    function handleDragEnd(e) {
        if (!puzzleState.isDragging || e.pointerId !== activePointerId) return;

        // 松手可能发生在下一帧之前，先应用最后收到的坐标再进行判定。
        if (dragFrameId !== null) {
            cancelAnimationFrame(dragFrameId);
            dragFrameId = null;
        }
        if (pendingPointerX !== null) {
            applyDragPosition(pendingPointerX);
            pendingPointerX = null;
        } else if (Number.isFinite(e.clientX)) {
            applyDragPosition(e.clientX);
        }

        puzzleState.isDragging = false;
        $dragBtn.classList.remove('is-dragging');
        $dragBtn.textContent = '|||';

        if ($dragBtn.hasPointerCapture && $dragBtn.hasPointerCapture(e.pointerId)) {
            $dragBtn.releasePointerCapture(e.pointerId);
        }
        activePointerId = null;

        const position = getPositionOnCurve(puzzleState.moveX);
        const { tolerance } = PUZZLE_CONFIG;
        const isMatch =
            Math.abs(position.x - puzzleState.targetX) <= tolerance &&
            Math.abs(position.y - puzzleState.targetY) <= tolerance;

        if (isMatch) {
            // 验证成功
            puzzleState.isMatch = true;
            $dragText.textContent = MESSAGES.success;
            $dragText.style.color = '#7ac23c';
            $dragBtn.style.backgroundColor = '#7ac23c';
            $dragBtn.style.color = 'white';

            setTimeout(resetPuzzle, PUZZLE_CONFIG.resetDelay.success);
        } else {
            // 验证失败
            $dragText.textContent = MESSAGES.failure;
            $dragText.style.color = '#e74c3c';

            // 震动效果
            const original = puzzleState.moveX;
            const steps = [10, -20, 15, -10, 5, 0];
            let i = 0;

            const shake = () => {
                if (i < steps.length) {
                    $dragBtn.style.transform = `translate3d(${original + steps[i]}px, 0, 0)`;
                    i++;
                    setTimeout(shake, 50);
                } else {
                    setTimeout(resetPuzzle, PUZZLE_CONFIG.resetDelay.failure);
                }
            };

            shake();
        }
    }

    /**
     * 重置拼图
     */
    function resetPuzzle() {
        cleanupCanvases();

        // 生成曲线路径，并确保中段存在完整可见且可达的目标点。
        let targetPoint = null;
        for (let attempt = 0; attempt < 20 && !targetPoint; attempt++) {
            puzzleState.curvePath = generateSmoothCurvePath();
            targetPoint = selectTargetPoint(puzzleState.curvePath);
        }

        // 极端随机结果下使用一条确定、安全的曲线兜底。
        if (!targetPoint) {
            puzzleState.curvePath = generateSmoothCurvePath([
                { x: 20, y: 110 },
                { x: 100, y: 150 },
                { x: 180, y: 80 },
                { x: 260, y: 150 },
                { x: 330, y: 110 }
            ]);
            targetPoint = selectTargetPoint(puzzleState.curvePath);
            if (!targetPoint) {
                targetPoint = puzzleState.curvePath.points[
                    Math.floor(puzzleState.curvePath.points.length / 2)
                ];
            }
        }

        puzzleState.targetX = targetPoint.x;
        puzzleState.targetY = targetPoint.y;
        puzzleState.dragRangeX = Math.max(0, $dragArea.clientWidth - $dragBtn.offsetWidth);
        puzzleState.fallbackColorIndex = Math.floor(Math.random() * FALLBACK_COLORS.length);

        renderScene();
    }

    /**
     * 按当前状态绘制整个场景（背景、目标拼图、辅助线、拼图块）。
     * 背景图片异步加载完成后也会调用此函数补绘。
     */
    function renderScene() {
        if (!puzzleState.curvePath) return;

        drawBackground();
        drawTargetPuzzle();
        drawCurvePath();
        updatePuzzlePiece();
    }

    /**
     * 绘制背景
     */
    function drawBackground() {
        const { canvasWidth, canvasHeight } = PUZZLE_CONFIG;
        ctx.img.clearRect(0, 0, canvasWidth, canvasHeight);

        if (backgroundStatus === 'ready') {
            ctx.img.drawImage(backgroundImg, 0, 0, canvasWidth, canvasHeight);
        } else if (backgroundStatus === 'failed') {
            ctx.img.fillStyle = FALLBACK_COLORS[puzzleState.fallbackColorIndex];
            ctx.img.fillRect(0, 0, canvasWidth, canvasHeight);
        }
        // loading 状态下保持空白，onload 后 renderScene 会补绘。
    }

    /**
     * 绘制目标拼图
     */
    function drawTargetPuzzle() {
        ctx.img.save();

        ctx.img.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.img.shadowBlur = 5;
        ctx.img.shadowOffsetX = 2;
        ctx.img.shadowOffsetY = 2;
        ctx.img.lineWidth = 2;
        ctx.img.strokeStyle = 'rgba(255, 255, 255, 0.8)';

        // 绘制拼图形状路径
        ctx.img.beginPath();
        tracePuzzleShape(ctx.img, puzzleState.targetX, puzzleState.targetY);
        ctx.img.closePath();
        ctx.img.stroke();  // 先描边
        ctx.img.clip();    // 然后剪切

        // 从背景画布直接生成拼图位图，不读取像素，兼容 file:// 等受限来源。
        preparePuzzlePiece();

        // 使目标拼图区域可见
        ctx.img.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        ctx.img.restore();

        drawTargetPuzzleOutline();
    }

    /**
     * 绘制目标拼图轮廓
     */
    function drawTargetPuzzleOutline() {
        outlineCtx.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        outlineCtx.save();
        outlineCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        outlineCtx.shadowBlur = 5;
        outlineCtx.shadowOffsetX = 2;
        outlineCtx.shadowOffsetY = 2;
        outlineCtx.lineWidth = 2;
        outlineCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

        outlineCtx.beginPath();
        tracePuzzleShape(outlineCtx, puzzleState.targetX, puzzleState.targetY);
        outlineCtx.closePath();
        outlineCtx.stroke();
        outlineCtx.restore();
    }

    /**
     * 清理所有Canvas和状态
     */
    function cleanupCanvases() {
        const { canvasWidth, canvasHeight } = PUZZLE_CONFIG;

        // 停止辅助线动画并清空各叠加层
        stopCurveAnimation();
        curveCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        outlineCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.img.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.overlay.clearRect(0, 0, canvasWidth, canvasHeight);

        // 重置状态
        puzzleState.isMatch = false;
        puzzleState.isDragging = false;
        puzzleState.moveX = 0;
        puzzleState.pieceReady = false;

        if (dragFrameId !== null) {
            cancelAnimationFrame(dragFrameId);
            dragFrameId = null;
        }
        pendingPointerX = null;
        activePointerId = null;

        $dragBtn.classList.remove('is-dragging');
        $dragBtn.style.transform = 'translate3d(0, 0, 0)';
        $dragBtn.style.backgroundColor = '';
        $dragBtn.style.color = '';
        $dragBtn.textContent = '|||';
        $moved.style.transform = 'scaleX(0)';
        $dragText.textContent = MESSAGES.idle;
        $dragText.style.color = '';
    }

    /**
     * 描摹拼图形状路径 - 固定凸起方向为右侧（上凸右凸）
     * @param {CanvasRenderingContext2D} targetCtx - 画布上下文
     * @param {number} mX - 起始X坐标
     * @param {number} yPos - 起始Y坐标
     */
    function tracePuzzleShape(targetCtx, mX, yPos) {
        const { radius: r, size: s } = PUZZLE_CONFIG;

        // 从左上角开始绘制
        targetCtx.moveTo(mX, yPos);

        // 上边（带上凸形状）
        targetCtx.lineTo(mX + s / 2 - r, yPos);
        targetCtx.arc(mX + s / 2, yPos, r, Math.PI, 2 * Math.PI);
        targetCtx.lineTo(mX + s, yPos);

        // 右边（带右凸形状）
        targetCtx.lineTo(mX + s, yPos + s / 2 - r);
        targetCtx.arc(mX + s, yPos + s / 2, r, 1.5 * Math.PI, 0.5 * Math.PI);
        targetCtx.lineTo(mX + s, yPos + s);

        // 底边和左边（直线）
        targetCtx.lineTo(mX, yPos + s);
        targetCtx.lineTo(mX, yPos);
    }

    /**
     * 一轮验证码只生成一次拼图位图，拖动时直接复用。
     */
    function preparePuzzlePiece() {
        if (!Number.isFinite(puzzleState.targetX) || !Number.isFinite(puzzleState.targetY)) {
            puzzleState.pieceReady = false;
            return;
        }

        pieceCtx.clearRect(0, 0, pieceCanvas.width, pieceCanvas.height);

        // 偏移量确保拼图凸起也落在Canvas内
        const offsetX = PUZZLE_CONFIG.radius;
        const offsetY = PUZZLE_CONFIG.radius;

        // 先裁剪形状，再从背景Canvas复制对应区域；全程不调用getImageData。
        pieceCtx.save();
        pieceCtx.beginPath();
        tracePuzzleShape(pieceCtx, offsetX, offsetY);
        pieceCtx.closePath();
        pieceCtx.clip();
        pieceCtx.drawImage(
            canvas.img,
            offsetX - puzzleState.targetX,
            offsetY - puzzleState.targetY
        );
        pieceCtx.restore();

        // 添加拼图描边
        pieceCtx.beginPath();
        tracePuzzleShape(pieceCtx, offsetX, offsetY);
        pieceCtx.closePath();
        pieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        pieceCtx.lineWidth = 2;
        pieceCtx.stroke();

        puzzleState.pieceReady = true;
    }

    /**
     * 更新拼图块位置
     */
    function updatePuzzlePiece() {
        if (!puzzleState.pieceReady) {
            preparePuzzlePiece();
            if (!puzzleState.pieceReady) return;
        }

        // 清除上一帧
        ctx.overlay.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        // 获取曲线上的当前位置
        const position = getPositionOnCurve(puzzleState.moveX);

        // 辅助线可见时，在曲线上留下经过的轨迹点
        if (puzzleState.showCurveAndPoints) {
            curveCtx.beginPath();
            curveCtx.arc(position.x, position.y, 3, 0, Math.PI * 2);
            curveCtx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            curveCtx.fill();
        }

        // 将离屏Canvas绘制到实际Canvas上的正确位置
        ctx.overlay.save();
        ctx.overlay.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.overlay.shadowBlur = 5;
        ctx.overlay.shadowOffsetX = 2;
        ctx.overlay.shadowOffsetY = 2;
        ctx.overlay.drawImage(
            pieceCanvas,
            position.x - PUZZLE_CONFIG.radius,
            position.y - PUZZLE_CONFIG.radius
        );
        ctx.overlay.restore();
    }

    /**
     * 生成平滑曲线路径
     */
    function generateSmoothCurvePath(controlPoints = generateControlPoints()) {
        const { resolution } = PUZZLE_CONFIG.curve;
        const points = [];
        const cumulativeLengths = [];
        let totalLength = 0;
        let lastPoint = null;

        // 使用Catmull-Rom样条曲线
        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];

            // 计算控制点
            const cp1 = i > 0 ? controlPoints[i - 1] : p1;
            const cp2 = i < controlPoints.length - 2 ? controlPoints[i + 2] : p2;

            // 生成曲线点（每段的起点与上一段终点重合，跳过重复点）
            for (let j = (i === 0 ? 0 : 1); j <= resolution; j++) {
                const t = j / resolution;
                const point = {
                    x: catmullRomInterpolate(cp1.x, p1.x, p2.x, cp2.x, t),
                    y: catmullRomInterpolate(cp1.y, p1.y, p2.y, cp2.y, t)
                };

                if (lastPoint) {
                    totalLength += Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
                }

                points.push(point);
                cumulativeLengths.push(totalLength);
                lastPoint = point;
            }
        }

        return {
            points,
            totalLength,
            cumulativeLengths,
            controlPoints
        };
    }

    /**
     * Catmull-Rom样条插值
     */
    function catmullRomInterpolate(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    /**
     * 生成随机控制点
     */
    function generateControlPoints() {
        const { canvasWidth, canvasHeight } = PUZZLE_CONFIG;
        const { points: numPoints, yMargin } = PUZZLE_CONFIG.curve;
        const yMin = canvasHeight * yMargin;
        const yMax = canvasHeight * (1 - yMargin);
        const randomY = () => yMin + Math.random() * (yMax - yMin);
        const points = [];

        // 第一个点固定在左侧
        points.push({ x: Math.random() * (canvasWidth * 0.2), y: randomY() });

        // 中间点完全随机分布
        for (let i = 1; i < numPoints - 1; i++) {
            points.push({ x: Math.random() * canvasWidth, y: randomY() });
        }

        // 最后一个点固定在右侧
        points.push({ x: canvasWidth * 0.8 + Math.random() * (canvasWidth * 0.2), y: randomY() });

        return points;
    }

    /**
     * 校验曲线数据的完整性
     */
    function isValidCurve(curve) {
        return !!curve &&
            Array.isArray(curve.points) &&
            Array.isArray(curve.cumulativeLengths) &&
            curve.points.length >= 2 &&
            curve.cumulativeLengths.length === curve.points.length &&
            Number.isFinite(curve.totalLength) &&
            curve.totalLength > 0;
    }

    /**
     * 在曲线上随机选择目标点
     */
    function selectTargetPoint(curve) {
        if (!isValidCurve(curve)) return null;

        const { canvasWidth, canvasHeight, size, radius } = PUZZLE_CONFIG;
        const maxTargetX = canvasWidth - size - radius;
        const maxTargetY = canvasHeight - size;
        const isFullyVisible = point =>
            point.x >= 0 &&
            point.x <= maxTargetX &&
            point.y >= radius &&
            point.y <= maxTargetY;

        // 只在曲线中段（按弧长20%~80%）选择完整可见的目标点
        const candidates = curve.points.filter((point, index) => {
            const progress = curve.cumulativeLengths[index] / curve.totalLength;
            return progress >= 0.2 && progress <= 0.8 && isFullyVisible(point);
        });

        return candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : null;
    }

    /**
     * 获取曲线上的位置
     */
    function getPositionOnCurve(moveX) {
        if (!isValidCurve(puzzleState.curvePath)) {
            return {
                x: Number.isFinite(moveX) ? moveX : 0,
                y: PUZZLE_CONFIG.canvasHeight / 2
            };
        }

        const { points, cumulativeLengths, totalLength } = puzzleState.curvePath;
        const progress = puzzleState.dragRangeX > 0
            ? Math.max(0, Math.min((Number.isFinite(moveX) ? moveX : 0) / puzzleState.dragRangeX, 1))
            : 0;

        if (progress === 0) return points[0];
        if (progress === 1) return points[points.length - 1];

        // 按实际曲线长度查找所在区段，使拼图在整个滑块行程内匀速移动。
        const targetLength = progress * totalLength;
        let low = 1;
        let high = cumulativeLengths.length - 1;

        while (low < high) {
            const mid = (low + high) >> 1;
            if (cumulativeLengths[mid] < targetLength) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const currentIndex = low - 1;
        const segmentStart = cumulativeLengths[currentIndex];
        const segmentLength = cumulativeLengths[low] - segmentStart;
        const rawT = segmentLength > 0 ? (targetLength - segmentStart) / segmentLength : 0;
        const t = Math.max(0, Math.min(rawT, 1));
        const currentPoint = points[currentIndex];
        const nextPoint = points[low];

        return {
            x: currentPoint.x + (nextPoint.x - currentPoint.x) * t,
            y: currentPoint.y + (nextPoint.y - currentPoint.y) * t
        };
    }

    /**
     * 绘制曲线路径（辅助线）
     */
    function drawCurvePath() {
        stopCurveAnimation();
        curveCtx.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        if (!puzzleState.showCurveAndPoints || !isValidCurve(puzzleState.curvePath)) return;

        drawStaticCurveParts();

        // 开始目标点脉动动画
        curveAnimPhase = 0;
        curveLastPaintTime = 0;
        curveAnimationFrameId = requestAnimationFrame(animateTargetPoint);
    }

    /**
     * 停止辅助线动画。
     */
    function stopCurveAnimation() {
        if (curveAnimationFrameId !== null) {
            cancelAnimationFrame(curveAnimationFrameId);
            curveAnimationFrameId = null;
        }
        curveLastPaintTime = 0;
    }

    /**
     * 停止动画并清空辅助线。
     */
    function removeCurvePath() {
        stopCurveAnimation();
        curveCtx.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
    }

    /**
     * 绘制静态曲线部分
     */
    function drawStaticCurveParts() {
        const { points, controlPoints } = puzzleState.curvePath;

        // 绘制曲线
        curveCtx.beginPath();
        curveCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            curveCtx.lineTo(points[i].x, points[i].y);
        }
        curveCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        curveCtx.lineWidth = 2;
        curveCtx.stroke();

        // 绘制控制点及编号
        curveCtx.font = '12px Arial';
        curveCtx.textAlign = 'center';
        for (let i = 0; i < controlPoints.length; i++) {
            const point = controlPoints[i];

            curveCtx.beginPath();
            curveCtx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            curveCtx.fillStyle = CONTROL_POINT_COLORS[i % CONTROL_POINT_COLORS.length];
            curveCtx.fill();

            curveCtx.fillStyle = 'white';
            curveCtx.fillText(i + 1, point.x, point.y - 10);
        }
    }

    /**
     * 目标点脉动动画
     */
    function animateTargetPoint(timestamp) {
        curveAnimationFrameId = null;

        if (!puzzleState.showCurveAndPoints || puzzleState.isMatch) return;

        const frameInterval = 1000 / PERFORMANCE_CONFIG.animationFrameRate;
        if (!curveLastPaintTime || timestamp - curveLastPaintTime >= frameInterval) {
            curveLastPaintTime = timestamp;

            // 清除目标点区域
            const animSize = 12;
            curveCtx.clearRect(
                puzzleState.targetX - animSize,
                puzzleState.targetY - animSize,
                animSize * 2,
                animSize * 2
            );

            // 绘制脉动效果
            curveAnimPhase += 0.05;
            const pulseSize = 5 + Math.sin(curveAnimPhase) * 2;

            curveCtx.beginPath();
            curveCtx.arc(puzzleState.targetX, puzzleState.targetY, pulseSize, 0, Math.PI * 2);
            curveCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            curveCtx.fill();
        }

        curveAnimationFrameId = requestAnimationFrame(animateTargetPoint);
    }

    /**
     * 获取GitHub star count
     */
    function fetchGitHubStarCount() {
        const starCountElement = document.getElementById('star-count');
        if (!starCountElement) return;

        fetch('https://api.github.com/repos/kexinoh/Curve-Puzzle-CAPTCHA')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                starCountElement.textContent = `Stars: ${data.stargazers_count}`;
            })
            .catch(error => {
                console.error('Error fetching star count:', error);
            });
    }
});
