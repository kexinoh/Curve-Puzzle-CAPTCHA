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
        curve: {
            points: 5,              // 控制点数量
            yMargin: 0.2,          // y轴边距比例（上下各预留20%）
            resolution: 100         // 曲线采样点数量
        }
    };

    // 性能优化配置
    const PERFORMANCE_CONFIG = {
        animationFrameRate: 60,    // 动画帧率限制
        useLowQualityMode: false   // 低质量模式标志
    };

    // 本地图片集 - 改为使用颜色背景，避免网络图片加载问题
    const backgroundColors = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'
    ];

    // 状态变量
    let puzzleState = {
        number: null,
        centerX: null,
        centerY: null,
        isMatch: false,
        moveX: 0,
        dragStartX: 0,
        dragEndX: 0,
        isDragging: false,
        curvePath: null,
        targetX: null,
        targetY: null,
        currentImageIndex: 0,
        showCurveAndPoints: false // 是否显示曲线和控制点
    };

    // 拖动时只在浏览器绘制帧中处理最新坐标，避免事件堆积。
    let dragFrameId = null;
    let pendingPointerX = null;
    let activePointerId = null;
    let curveCanvas = null;
    let curveAnimationFrameId = null;
    let curveLastPaintTime = 0;
    const dragMetrics = {
        trackLeft: 0,
        areaWidth: PUZZLE_CONFIG.canvasWidth,
        maxX: PUZZLE_CONFIG.canvasWidth - PUZZLE_CONFIG.size,
        grabOffsetX: 0
    };

    // 确保DOM结构正确
    initializeDom();

    // 获取DOM元素 - 确保DOM元素已经存在
    const $dragBtn = document.querySelector('.yan_drag_btn');
    const $dragArea = document.querySelector('.yan_drag');
    const $moved = document.querySelector('.moved');
    const $dragText = document.querySelector('.yan_drag_text');

    // 获取Canvas上下文
    const canvas = {
        img: document.getElementById('yan_img2'),
        overlay: document.getElementById('yan_ceng')
    };

    // 确保所有DOM元素存在
    if (!canvas.img || !canvas.overlay || !$dragBtn || !$dragArea || !$moved || !$dragText) {
        console.error('无法找到必要的DOM元素：', {
            'yan_img2': !!canvas.img,
            'yan_ceng': !!canvas.overlay,
            'yan_drag_btn': !!$dragBtn,
            'yan_drag': !!$dragArea,
            'moved': !!$moved,
            'yan_drag_text': !!$dragText
        });
        return;
    }

    const ctx = {
        img: canvas.img.getContext('2d'),
        overlay: canvas.overlay.getContext('2d')
    };

    // 创建图像对象
    const img = new Image();

    // 显示拼图层
    document.querySelector('.yan_ceng').style.display = 'block';

    // 检测设备性能
    detectLowPerformanceDevice();

    // 设置事件监听
    setupEvents();

    // 初始化验证码
    resetPuzzle();

    // 获取GitHub star count
    fetchGitHubStarCount();

    /**
     * 创建必要的DOM元素
     */
    function initializeDom() {
        // 由于HTML文件中已经存在所需的DOM结构，我们只需获取引用而不创建新元素
        console.log('使用现有DOM结构...');

        // 修复Canvas的zIndex，确保叠加顺序正确
        const imgCanvas = document.getElementById('yan_img2');
        if (imgCanvas) {
            imgCanvas.style.position = 'absolute';
            imgCanvas.style.top = '0';
            imgCanvas.style.left = '0';
            imgCanvas.style.zIndex = '1';
        }

        const overlayCanvas = document.getElementById('yan_ceng');
        if (overlayCanvas) {
            overlayCanvas.style.position = 'absolute';
            overlayCanvas.style.top = '0';
            overlayCanvas.style.left = '0';
            overlayCanvas.style.zIndex = '2';
        }

        // 添加曲线显示开关
        const controlsContainer = document.querySelector('.yan_drag_text');
        if (controlsContainer) {
            const toggleContainer = document.createElement('div');
            toggleContainer.style.marginTop = '40px';
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';
            toggleContainer.style.justifyContent = 'center';

            const toggleLabel = document.createElement('label');
            toggleLabel.textContent = '显示辅助线: ';
            toggleLabel.style.marginRight = '5px';
            toggleLabel.style.fontSize = '12px';
            toggleLabel.style.color = '#666';

            const toggleSwitch = document.createElement('input');
            toggleSwitch.type = 'checkbox';
            toggleSwitch.checked = false;
            toggleSwitch.id = 'curve_toggle';

            toggleSwitch.addEventListener('change', function() {
                puzzleState.showCurveAndPoints = this.checked;

                if (this.checked) {
                    drawCurvePath();
                } else {
                    removeCurvePath();
                }
            });

            toggleContainer.appendChild(toggleLabel);
            toggleContainer.appendChild(toggleSwitch);
            controlsContainer.parentNode.appendChild(toggleContainer);
        }

        console.log('DOM初始化完成');
    }

    /**
     * 自动检测低配设备
     */
    function detectLowPerformanceDevice() {
        const startTime = performance.now();
        let count = 0;
        for (let i = 0; i < 1000000; i++) {
            count += i;
        }
        const duration = performance.now() - startTime;

        if (duration > 50) {
            console.log("检测到低性能设备，启用性能优化...");
            PERFORMANCE_CONFIG.useLowQualityMode = true;
            PERFORMANCE_CONFIG.animationFrameRate = 15;
            PUZZLE_CONFIG.curve.resolution = 50;
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
    }

    /**
     * 处理拖动开始
     */
    function handleDragStart(e) {
        if (puzzleState.isMatch || (e.pointerType === 'mouse' && e.button !== 0)) return;

        e.preventDefault();

        const btnRect = $dragBtn.getBoundingClientRect();

        dragMetrics.trackLeft = btnRect.left - puzzleState.moveX;
        dragMetrics.areaWidth = $dragArea.clientWidth;
        dragMetrics.maxX = Math.max(0, dragMetrics.areaWidth - btnRect.width);
        dragMetrics.grabOffsetX = e.clientX - btnRect.left;

        puzzleState.isDragging = true;
        puzzleState.dragStartX = 0;
        puzzleState.dragEndX = dragMetrics.maxX;
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
        const isXMatch = Math.abs(position.x - puzzleState.targetX) <= 5;
        const isYMatch = Math.abs(position.y - puzzleState.targetY) <= 5;

        if (isXMatch && isYMatch) {
            // 验证成功
            puzzleState.isMatch = true;
            $dragText.textContent = '验证成功!';
            $dragText.style.color = '#7ac23c';
            $dragBtn.style.backgroundColor = '#7ac23c';
            $dragBtn.style.color = 'white';

            // 3秒后重置
            setTimeout(resetPuzzle, 3000);
        } else {
            // 验证失败
            $dragText.textContent = '验证失败，请重试!';
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
                    // 重置
                    setTimeout(resetPuzzle, 1000);
                }
            };

            shake();
        }
    }

    /**
     * 重置拼图
     */
    function resetPuzzle() {
        console.log('重置拼图...');

        // 清理Canvas但保留图像
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

        // 选择目标点
        puzzleState.targetX = targetPoint.x;
        puzzleState.targetY = targetPoint.y;

        // 设置拖动区域范围
        puzzleState.dragStartX = 0;
        puzzleState.dragEndX = Math.max(0, $dragArea.clientWidth - $dragBtn.offsetWidth);

        // 随机生成背景 - 使用随机图片或纯色
        puzzleState.currentImageIndex = Math.floor(Math.random() * backgroundColors.length);

        // 绘制背景
        drawBackground();

        // 绘制目标拼图
        drawTargetPuzzle();

        // 绘制曲线路径
        if (puzzleState.showCurveAndPoints !== false) {
            drawCurvePath();
        }

        // 重置滑块位置
        $dragBtn.style.transform = 'translate3d(0, 0, 0)';
        $moved.style.transform = 'scaleX(0)';
        $dragText.textContent = '拖动滑块进行验证';
        $dragText.style.color = '';

        console.log('验证码重置完成');
    }

    /**
     * 绘制背景
     */
    function drawBackground() {
        console.log('绘制背景...');

        // 使用背景图片 - 从HTML中的img元素获取src
        const imgElement = document.getElementById('yan_img');
        if (imgElement && imgElement.src) {
            // 设置图片源并等待加载
            img.src = imgElement.src;

            // 图片加载完成后绘制
            if (img.complete) {
                ctx.img.drawImage(img, 0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                console.log('背景图片绘制完成');
            } else {
                // 如果图像尚未加载，等待它加载完成
                img.onload = function() {
                    ctx.img.drawImage(img, 0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                    console.log('背景图片加载并绘制完成');

                    // 重新绘制目标拼图，确保它在背景之上
                    drawTargetPuzzle();
                };

                // 添加错误处理
                img.onerror = function() {
                    console.error('背景图片加载失败，使用纯色背景替代');
                    // 回退到纯色背景
                    const color = backgroundColors[puzzleState.currentImageIndex];
                    ctx.img.fillStyle = color;
                    ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                };

                console.log('等待背景图片加载...');
            }
        } else {
            console.warn('找不到背景图片元素，使用纯色背景替代');
            // 使用纯色背景作为备选
            const color = backgroundColors[puzzleState.currentImageIndex];
            ctx.img.fillStyle = color;
            ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
        }
    }

    /**
     * 绘制目标拼图
     */
    function drawTargetPuzzle() {
        console.log('绘制目标拼图...');

        // 保存当前状态
        ctx.img.save();

        // 添加样式
        ctx.img.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.img.shadowBlur = 5;
        ctx.img.shadowOffsetX = 2;
        ctx.img.shadowOffsetY = 2;
        ctx.img.lineWidth = 2;
        ctx.img.strokeStyle = 'rgba(255, 255, 255, 0.8)';

        // 绘制拼图形状路径
        ctx.img.beginPath();
        puzzleState.number = drawPuzzleShape(ctx.img, puzzleState.targetX, null, puzzleState.targetY);
        ctx.img.closePath();
        ctx.img.stroke();  // 先描边
        ctx.img.clip();    // 然后剪切

        // 从背景画布直接生成拼图位图，不读取像素，兼容 file:// 等受限来源。
        preparePuzzlePiece();

        // 使目标拼图区域可见
        ctx.img.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        ctx.img.restore();

        // 绘制目标拼图轮廓
        drawTargetPuzzleOutline();

        // 初始化拼图位置
        updatePuzzlePiece();
    }

    /**
     * 绘制目标拼图轮廓
     */
    function drawTargetPuzzleOutline() {
        // 清理旧的轮廓Canvas
        if (document.getElementById('target_outline')) {
            document.getElementById('target_outline').remove();
        }

        const outlineCanvas = document.createElement('canvas');
        outlineCanvas.id = 'target_outline';
        outlineCanvas.width = PUZZLE_CONFIG.canvasWidth;
        outlineCanvas.height = PUZZLE_CONFIG.canvasHeight;
        outlineCanvas.style.position = 'absolute';
        outlineCanvas.style.top = '0';
        outlineCanvas.style.left = '0';
        outlineCanvas.style.zIndex = '3';
        outlineCanvas.style.pointerEvents = 'none';

        // 找到正确的父容器
        const container = document.querySelector('.yan_ceng');
        if (!container) {
            console.error('找不到容器元素 .yan_ceng');
            return;
        }
        container.appendChild(outlineCanvas);

        const outlineCtx = outlineCanvas.getContext('2d');

        // 添加样式
        outlineCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        outlineCtx.shadowBlur = 5;
        outlineCtx.shadowOffsetX = 2;
        outlineCtx.shadowOffsetY = 2;
        outlineCtx.lineWidth = 2;
        outlineCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

        // 绘制轮廓
        outlineCtx.beginPath();
        // 使用完整的拼图形状绘制，不需要提前移动到起点
        drawPuzzleShape(outlineCtx, puzzleState.targetX, puzzleState.number, puzzleState.targetY);
        outlineCtx.closePath();
        outlineCtx.stroke();
    }

    /**
     * 清理所有Canvas和状态
     */
    function cleanupCanvases() {
        // 停止辅助线动画并清理其Canvas
        removeCurvePath();

        // 清理目标轮廓Canvas
        if (document.getElementById('target_outline')) {
            document.getElementById('target_outline').remove();
        }

        // 清理拼图Canvas但不删除元素本身
        if (ctx.img && ctx.overlay) {
            ctx.img.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
            ctx.overlay.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
        }

        // 重置状态
        puzzleState.isMatch = false;
        puzzleState.isDragging = false;
        puzzleState.moveX = 0;
        puzzleState.offscreenReady = false;

        if (dragFrameId !== null) {
            cancelAnimationFrame(dragFrameId);
            dragFrameId = null;
        }
        pendingPointerX = null;
        activePointerId = null;

        if ($dragBtn) {
            $dragBtn.classList.remove('is-dragging');
            $dragBtn.style.transform = 'translate3d(0, 0, 0)';
        }
        if ($moved) $moved.style.transform = 'scaleX(0)';
        if ($dragText) $dragText.textContent = '拖动滑块进行验证';
    }

    /**
     * 绘制拼图形状 - 固定凸起方向为右侧
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} mX - 起始X坐标
     * @param {number} n - 形状编号(可选)
     * @param {number} cY - Y坐标(可选)
     * @returns {number} 拼图形状编号
     */
    function drawPuzzleShape(ctx, mX, n, cY) {
        const { radius: r, size: s } = PUZZLE_CONFIG;
        // 限制拼图形状只使用凸起方向为右侧的形状（上凸右凸）
        const number = 4;

        // 如果没有提供Y坐标，则使用中心点
        const yPos = (cY !== undefined) ? cY : (puzzleState.centerY || PUZZLE_CONFIG.canvasHeight / 2);

        // 绘制完整的拼图形状（矩形 + 上凸右凸）
        // 从左上角开始绘制
        ctx.moveTo(mX, yPos); // 左上角

        // 上边（带上凸形状）
        ctx.lineTo(mX + s/2 - r, yPos);
        ctx.arc(mX + s/2, yPos, r, Math.PI, 2 * Math.PI);
        ctx.lineTo(mX + s, yPos);

        // 右边（带右凸形状）
        ctx.lineTo(mX + s, yPos + s/2 - r);
        ctx.arc(mX + s, yPos + s/2, r, 1.5 * Math.PI, 0.5 * Math.PI);
        ctx.lineTo(mX + s, yPos + s);

        // 底边和左边（直线）
        ctx.lineTo(mX, yPos + s);
        ctx.lineTo(mX, yPos);

        return number;
    }

    /**
     * 一轮验证码只生成一次拼图位图，拖动时直接复用。
     */
    function preparePuzzlePiece() {
        if (!Number.isFinite(puzzleState.targetX) || !Number.isFinite(puzzleState.targetY)) {
            puzzleState.offscreenReady = false;
            return;
        }

        if (!puzzleState.offscreenCanvas) {
            puzzleState.offscreenCanvas = document.createElement('canvas');
            puzzleState.offscreenCanvas.width = PUZZLE_CONFIG.size*2;
            puzzleState.offscreenCanvas.height = PUZZLE_CONFIG.size*2;
            puzzleState.offscreenCtx = puzzleState.offscreenCanvas.getContext('2d');
        }

        const offCtx = puzzleState.offscreenCtx;
        offCtx.globalCompositeOperation = "source-over";
        offCtx.clearRect(0, 0, puzzleState.offscreenCanvas.width, puzzleState.offscreenCanvas.height);

        // 先裁剪形状，再从背景Canvas复制对应区域；全程不调用getImageData。
        offCtx.save();
        offCtx.beginPath();

        const offsetX = PUZZLE_CONFIG.radius; // 偏移量确保拼图在Canvas中心
        const offsetY = PUZZLE_CONFIG.radius;
        drawPuzzleShape(offCtx, offsetX, puzzleState.number, offsetY);

        offCtx.closePath();
        offCtx.clip();
        offCtx.drawImage(
            canvas.img,
            offsetX - puzzleState.targetX,
            offsetY - puzzleState.targetY
        );
        offCtx.restore();

        // 添加拼图描边
        offCtx.beginPath();
        drawPuzzleShape(offCtx, offsetX, puzzleState.number, offsetY);
        offCtx.closePath();
        offCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        offCtx.lineWidth = 2;
        offCtx.stroke();

        puzzleState.offscreenReady = true;
    }

    /**
     * 更新拼图块位置
     */
    function updatePuzzlePiece() {
        if (!ctx.overlay) {
            console.error('缺少必要的拼图数据');
            return;
        }

        if (!puzzleState.offscreenReady) {
            preparePuzzlePiece();
            if (!puzzleState.offscreenReady) return;
        }

        // 清除上一帧
        ctx.overlay.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        // 获取曲线上的当前位置
        const position = getPositionOnCurve(puzzleState.moveX);

        // 在曲线路径上标记当前位置
        const pathCanvas = document.getElementById('curve_path');
        if (pathCanvas) {
            const pathCtx = pathCanvas.getContext('2d');
            pathCtx.beginPath();
            pathCtx.arc(position.x, position.y, 3, 0, Math.PI * 2);
            pathCtx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            pathCtx.fill();
        }

        // 将离屏Canvas绘制到实际Canvas上的正确位置
        ctx.overlay.save();
        ctx.overlay.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.overlay.shadowBlur = 5;
        ctx.overlay.shadowOffsetX = 2;
        ctx.overlay.shadowOffsetY = 2;

        // 绘制到曲线上的当前位置
        ctx.overlay.drawImage(
            puzzleState.offscreenCanvas,
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

            // 生成曲线点
            for (let j = 0; j <= resolution; j++) {
                const t = j / resolution;

                const x = catmullRomInterpolate(cp1.x, p1.x, p2.x, cp2.x, t);
                const y = catmullRomInterpolate(cp1.y, p1.y, p2.y, cp2.y, t);

                const point = { x, y };

                if (i === 0 || j > 0) {
                    if (lastPoint) {
                        const dx = point.x - lastPoint.x;
                        const dy = point.y - lastPoint.y;
                        totalLength += Math.sqrt(dx * dx + dy * dy);
                    }

                    points.push(point);
                    cumulativeLengths.push(totalLength);
                    lastPoint = point;
                }
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
        const points = [];
        const { points: numPoints, yMargin } = PUZZLE_CONFIG.curve;
        const yMin = PUZZLE_CONFIG.canvasHeight * yMargin;
        const yMax = PUZZLE_CONFIG.canvasHeight * (1 - yMargin);

        // 第一个点固定在左侧
        points.push({
            x: Math.random() * (PUZZLE_CONFIG.canvasWidth * 0.2),
            y: yMin + Math.random() * (yMax - yMin)
        });

        // 中间点完全随机分布
        for (let i = 1; i < numPoints - 1; i++) {
            const x = Math.random() * PUZZLE_CONFIG.canvasWidth;
            const y = yMin + Math.random() * (yMax - yMin);
            points.push({ x, y });
        }

        // 最后一个点固定在右侧
        points.push({
            x: PUZZLE_CONFIG.canvasWidth * 0.8 + Math.random() * (PUZZLE_CONFIG.canvasWidth * 0.2),
            y: yMin + Math.random() * (yMax - yMin)
        });

        return points;
    }

    /**
     * 在曲线上随机选择目标点
     */
    function selectTargetPoint(curve) {
        if (
            !curve ||
            !Array.isArray(curve.points) ||
            !Array.isArray(curve.cumulativeLengths) ||
            curve.points.length < 2 ||
            curve.cumulativeLengths.length !== curve.points.length ||
            !Number.isFinite(curve.totalLength) ||
            curve.totalLength <= 0
        ) {
            return null;
        }

        const maxTargetX = PUZZLE_CONFIG.canvasWidth - PUZZLE_CONFIG.size - PUZZLE_CONFIG.radius;
        const maxTargetY = PUZZLE_CONFIG.canvasHeight - PUZZLE_CONFIG.size;
        const isFullyVisible = point =>
            point.x >= 0 &&
            point.x <= maxTargetX &&
            point.y >= PUZZLE_CONFIG.radius &&
            point.y <= maxTargetY;

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
        if (
            !puzzleState.curvePath ||
            !Array.isArray(puzzleState.curvePath.points) ||
            !Array.isArray(puzzleState.curvePath.cumulativeLengths) ||
            puzzleState.curvePath.points.length < 2 ||
            puzzleState.curvePath.cumulativeLengths.length !== puzzleState.curvePath.points.length ||
            !Number.isFinite(puzzleState.curvePath.totalLength) ||
            puzzleState.curvePath.totalLength <= 0
        ) {
            return {
                x: Number.isFinite(moveX) ? moveX : 0,
                y: PUZZLE_CONFIG.canvasHeight / 2
            };
        }

        const { points, cumulativeLengths, totalLength } = puzzleState.curvePath;
        const dragDistance = puzzleState.dragEndX - puzzleState.dragStartX;
        const progress = dragDistance > 0
            ? Math.max(
                0,
                Math.min(((Number.isFinite(moveX) ? moveX : 0) - puzzleState.dragStartX) / dragDistance, 1)
            )
            : 0;

        if (progress === 0 || totalLength === 0) return points[0];
        if (progress === 1) return points[points.length - 1];

        // 按实际曲线长度查找所在区段，使拼图在整个滑块行程内匀速移动。
        const targetLength = progress * totalLength;
        let low = 1;
        let high = cumulativeLengths.length - 1;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (cumulativeLengths[mid] < targetLength) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const nextIndex = low;
        const currentIndex = nextIndex - 1;
        const segmentStart = cumulativeLengths[currentIndex];
        const segmentLength = cumulativeLengths[nextIndex] - segmentStart;
        const rawT = segmentLength > 0 ? (targetLength - segmentStart) / segmentLength : 0;
        const t = Math.max(0, Math.min(rawT, 1));
        const currentPoint = points[currentIndex];
        const nextPoint = points[nextIndex];

        return {
            x: currentPoint.x + (nextPoint.x - currentPoint.x) * t,
            y: currentPoint.y + (nextPoint.y - currentPoint.y) * t
        };
    }

    /**
     * 绘制曲线路径
     */
    function drawCurvePath() {
        removeCurvePath();
        if (!puzzleState.showCurveAndPoints || !puzzleState.curvePath) return;

        // 创建路径Canvas
        const pathCanvas = document.createElement('canvas');
        pathCanvas.id = 'curve_path';
        pathCanvas.width = PUZZLE_CONFIG.canvasWidth;
        pathCanvas.height = PUZZLE_CONFIG.canvasHeight;
        pathCanvas.style.position = 'absolute';
        pathCanvas.style.top = '0';
        pathCanvas.style.left = '0';
        pathCanvas.style.zIndex = '4';
        pathCanvas.style.pointerEvents = 'none';

        // 找到正确的父容器
        const container = document.querySelector('.yan_ceng');
        if (!container) {
            console.error('找不到容器元素 .yan_ceng');
            return;
        }
        container.appendChild(pathCanvas);
        curveCanvas = pathCanvas;

        // 绘制静态部分
        const pathCtx = pathCanvas.getContext('2d');
        if (!pathCtx) {
            removeCurvePath();
            return;
        }
        drawStaticCurveParts(pathCtx);

        // 开始动画
        puzzleState.targetAnim = 0;
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
     * 停止动画并移除辅助线Canvas。
     */
    function removeCurvePath() {
        stopCurveAnimation();

        const currentCanvas = curveCanvas;
        curveCanvas = null;
        if (currentCanvas && currentCanvas.isConnected) {
            currentCanvas.remove();
        }

        const staleCanvas = document.getElementById('curve_path');
        if (staleCanvas && staleCanvas !== currentCanvas) {
            staleCanvas.remove();
        }
    }

    /**
     * 绘制静态曲线部分
     */
    function drawStaticCurveParts(pathCtx) {
        if (!puzzleState.curvePath) return;

        const points = puzzleState.curvePath.points;
        const controlPoints = puzzleState.curvePath.controlPoints;

        // 绘制曲线
        pathCtx.beginPath();
        pathCtx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            pathCtx.lineTo(points[i].x, points[i].y);
        }

        pathCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        pathCtx.lineWidth = 2;
        pathCtx.stroke();

        // 绘制控制点
        for (let i = 0; i < controlPoints.length; i++) {
            const point = controlPoints[i];

            pathCtx.beginPath();
            pathCtx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            pathCtx.fillStyle = [
                'rgba(255, 0, 0, 0.7)',
                'rgba(0, 255, 0, 0.7)',
                'rgba(0, 0, 255, 0.7)',
                'rgba(255, 255, 0, 0.7)',
                'rgba(255, 0, 255, 0.7)'
            ][i];
            pathCtx.fill();

            // 添加标签
            pathCtx.font = "12px Arial";
            pathCtx.fillStyle = "white";
            pathCtx.textAlign = "center";
            pathCtx.fillText(i + 1, point.x, point.y - 10);
        }
    }

    /**
     * 动画目标点
     */
    function animateTargetPoint(timestamp) {
        curveAnimationFrameId = null;

        const currentCanvas = curveCanvas;
        if (
            !puzzleState.showCurveAndPoints ||
            puzzleState.isMatch ||
            !currentCanvas ||
            !currentCanvas.isConnected
        ) {
            return;
        }

        const pathCtx = currentCanvas.getContext('2d');
        if (!pathCtx) return;

        const frameInterval = 1000 / PERFORMANCE_CONFIG.animationFrameRate;
        if (!curveLastPaintTime || timestamp - curveLastPaintTime >= frameInterval) {
            curveLastPaintTime = timestamp;

            // 清除目标点区域
            const animSize = 12;
            pathCtx.clearRect(
                puzzleState.targetX - animSize,
                puzzleState.targetY - animSize,
                animSize * 2,
                animSize * 2
            );

            // 绘制脉动效果
            puzzleState.targetAnim = (puzzleState.targetAnim || 0) + 0.05;
            const pulseSize = 5 + Math.sin(puzzleState.targetAnim) * 2;

            pathCtx.beginPath();
            pathCtx.arc(puzzleState.targetX, puzzleState.targetY, pulseSize, 0, Math.PI * 2);
            pathCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            pathCtx.fill();
        }

        if (
            puzzleState.showCurveAndPoints &&
            !puzzleState.isMatch &&
            curveCanvas === currentCanvas &&
            currentCanvas.isConnected
        ) {
            curveAnimationFrameId = requestAnimationFrame(animateTargetPoint);
        }
    }

    // 获取GitHub star count
    function fetchGitHubStarCount() {
        fetch('https://api.github.com/repos/kexinoh/Curve-Puzzle-CAPTCHA')
            .then(response => response.json())
            .then(data => {
                const starCountElement = document.getElementById('star-count');
                starCountElement.textContent = `Stars: ${data.stargazers_count}`;
            })
            .catch(error => {
                console.error('Error fetching star count:', error);
            });
    }
});
