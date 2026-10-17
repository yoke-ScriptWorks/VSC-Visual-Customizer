// ==UserScript==
// @name          VSC Visual Customizer
// @namespace     https://github.com/yoke-ScriptWorks/VSC-Visual-Customizer
// @version       1.1.261014
// @description   VSC Visual Customizer
// @author        yoke
// @match         https://*.amazon.co.jp/*
// @match         https://*.twitch.tv/*
// @match         https://*.youtube.com/*
// @run-at        document-idle
// @grant         none
// @updateURL     https://raw.githubusercontent.com/yoke-ScriptWorks/VSC-Visual-Customizer/main/vsc-visual-customizer.user.js
// @downloadURL   https://raw.githubusercontent.com/yoke-ScriptWorks/VSC-Visual-Customizer/main/vsc-visual-customizer.user.js
// ==/UserScript==

(function () {
    "use strict";

    const DEBUG_MODE = false;

    /*
     * 全体設定
     */

    // 速度表示を「変更あり」として強調しておく時間
    const DRAGGABLE_CHANGED_DURATION_MS = 2000;

    // 実行してよい時刻になったかを確認する間隔
    const TICK_INTERVAL_MS = 100;

    // 監視間隔
    // 前回の poll の完了からこの時間が経過するまで次の poll は始まらない
    const POLL_INTERVAL_MS = 2000;

    // 次回 poll 呼び出し可能時間
    // 初回起動時間は POLL_INTERVAL_MS μ秒後
    let nextPollTime = performance.now() + POLL_INTERVAL_MS;

    // dataset に付与する値(data-xxx="on")
    const DATASET_ON_VALUE = "on";

    // 適用するスタイルが重複しないように管理する ID
    const SHADOW_ROOT_STYLE_ID = "visual-customizer-vsc-style";

    // スタイルを変更する要素のセレクタ
    const hostControllerSelector = ".vsc-controller";
    const shadowControllerSelector = "#controller";
    const draggableSelector = "span.draggable";
    const buttonsSelector = "button";
    const raiseSpecificitySelector = ":not(#dummy)";

    // 特定の要素に直接適用するプロパティが適用されているかを確認する目印
    // data-applied="on" となっていれば適用済
    const appliedPropertyKey = "applied";

    // 「どの要素に、どの dataset を付けるか」
    // 付与される属性: data-<key>="on"
    const datasetRules = [
        { selector: shadowControllerSelector, key: "controller" },
        { selector: draggableSelector, key: "draggable" },
        { selector: buttonsSelector, key: "button" },
    ];

    // VSC ごとの状態を管理する
    // key: hostController
    // value: VSCState
    const vscStates = new Map();

    /*
     * Amazon用 設定
     */

    // 協調用として指定する z-index
    const AMAZON_VSC_Z_INDEX = 1000;

    // 適用するスタイルが重複しないように管理する ID
    const AMAZON_STYLE_ID = "visual-customizer-amazon-style";

    // Amazon の VSC である時の VSC のセレクタ
    const amazonPlayerSelector =
        ":is(#dv-web-player, #dv-web-player-2) vsc-controller.vsc-controller";

    // Amazonフラグ
    let isAmazon = false;

    /*
     *  CSS 設定
     */
    const cssVariableNamespace = "vsc-customizer";

    const colors = {
        draggableColor: "rgba(0, 0, 0, 0.25)",
        draggableBackground: "rgba(255, 255, 255, 0.03)",
        draggableBorder: "rgba(255, 255, 255, 0.06)",
        draggableColorChanged: "rgba(255, 255, 255, 0.45)",
        draggableBackgroundChanged: "rgba(0, 0, 0, 0.01)",
        draggableBorderChanged: "rgba(0, 0, 0, 0.02)",
        draggableColorHover: "rgba(255, 255, 255, 0.6)",
        draggableBackgroundHover: "rgba(0, 0, 0, 0.06)",
        draggableBorderHover: "rgba(0, 0, 0, 0.12)",
        buttonColor: "rgba(0, 0, 0, 0.25)",
        buttonBackground: "rgba(255, 255, 255, 0.03)",
        buttonBorder: "rgba(255, 255, 255, 0.06)",
        buttonColorHover: "rgba(255, 255, 255, 0.6)",
        buttonBackgroundHover: "rgba(0, 0, 0, 0.06)",
        buttonBorderHover: "rgba(0, 0, 0, 0.12)",
    };

    /*
     * shadowRoot 内に注入する CSS
     */
    const shadowRootStyleCSS = `
        /*
        * controllerのopacityはcssで指定すると謎の遅延が発生するので
        * controller変数に要素を保存したときに要素のstyleプロパティで指定している
        */
        ${shadowControllerSelector}${raiseSpecificitySelector}[data-controller]
        {
            display: block !important;
            z-index: ${2 ** 24 - 1} !important;
            visibility: visible !important;
            pointer-events: auto !important;

            height: 1.5em !important;
            margin: 0.4em 0 0 0.65em !important;

            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            opacity: 1 !important;
            filter: none !important;

            appearance: none !important;
            cursor: default;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-draggable]
        {
            --${cssVariableNamespace}-color: ${colors.draggableColor};
            --${cssVariableNamespace}-background-color: ${colors.draggableBackground};
            --${cssVariableNamespace}-border-color: ${colors.draggableBorder};

            display: inline-flex !important;
            visibility: visible !important;
            pointer-events: auto !important;
            justify-content: center !important;
            align-items: center !important;

            height: 1.5em !important;
            width: 3.5em !important;
            margin: auto auto 0 auto !important;
            padding: 0 !important;

            font-family: sans-serif, serif !important;
            color: var(--${cssVariableNamespace}-color) !important;
            background-color: var(--${cssVariableNamespace}-background-color) !important;
            border: thin solid var(--${cssVariableNamespace}-border-color) !important;
            border-radius: 0.2em !important;
            box-shadow: none !important;
            opacity: 0 !important;
            filter: none !important;

            appearance: none !important;
            transition: opacity 0.5s ease 1s, color 0.5s ease 0s, background-color 0.5s ease 0s, border 0.5s ease 0s !important;
            cursor: default !important;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-draggable][data-changed]
        {
            --${cssVariableNamespace}-color: ${colors.draggableColorChanged};
            --${cssVariableNamespace}-background-color: ${colors.draggableBackgroundChanged};
            --${cssVariableNamespace}-border-color: ${colors.draggableBorderChanged};

            opacity: 1 !important;

            transition: none !important;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-draggable]${raiseSpecificitySelector}:hover
        {
            --${cssVariableNamespace}-color: ${colors.draggableColorHover};
            --${cssVariableNamespace}-background-color: ${colors.draggableBackgroundHover};
            --${cssVariableNamespace}-border-color: ${colors.draggableBorderHover};

            opacity: 1 !important;

            transition: none !important;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-button].hideButton
        {
            display: none !important;
            visibility: hidden !important;

            opacity: 0 !important;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-button]
        {
            --${cssVariableNamespace}-color: ${colors.buttonColor};
            --${cssVariableNamespace}-background-color: ${colors.buttonBackground};
            --${cssVariableNamespace}-border-color: ${colors.buttonBorder};

            display: inline-flex !important;
            visibility: visible !important;
            width: 1.5em !important;
            height: 1.5em !important;
            justify-content: center !important;
            align-items: center !important;

            margin: 0.25em !important;
            padding: 0 !important;

            font-family: sans-serif, serif !important;
            color: var(--${cssVariableNamespace}-color) !important;
            background-color: var(--${cssVariableNamespace}-background-color) !important;
            border: thin solid var(--${cssVariableNamespace}-border-color) !important;
            border-radius: 0.2em !important;
            box-shadow: none !important;
            opacity: 1 !important;
            filter: none !important;

            appearance: none !important;
            transition: color 0.75s ease 0s, background-color 0.75s ease 0s, border 0.75s ease 0s !important;
            cursor: pointer !important;
        }
        ${shadowControllerSelector}${raiseSpecificitySelector} [data-button]:hover
        {
            --${cssVariableNamespace}-color: ${colors.buttonColorHover};
            --${cssVariableNamespace}-background-color: ${colors.buttonBackgroundHover};
            --${cssVariableNamespace}-border-color: ${colors.buttonBorderHover};

            transition: none !important;
        }
    `;

    const amazonDocumentStyleCSS = `
        ${amazonPlayerSelector}
        {
            z-index: ${AMAZON_VSC_Z_INDEX} !important;
        }
    `;

    /*
     * VSC 一つ分の状態と、その要素に対する操作を持つ。
     */
    class VSCState {
        hostController;
        shadowRoot = null;

        // 速度表示(span.draggable)の監視
        draggable = null;
        observer = null;

        // 速度表示の「変更あり」強調
        draggableText = "";
        draggableChangedTimer = null;

        constructor(hostController) {
            this.hostController = hostController;
            this.draggableText =
                hostController?.shadowRoot?.querySelector(draggableSelector)
                    ?.textContent ?? "";
        }

        // Observer とタイマーを破棄し、監視対象の参照も外す
        disposeObserver() {
            clearTimeout(this.draggableChangedTimer);
            this.draggableChangedTimer = null;

            this.observer?.disconnect();

            this.observer = null;
            this.draggable = null;
        }

        // すべて破棄する(Observer + 参照)
        dispose() {
            this.disposeObserver();

            this.shadowRoot = null;
            this.hostController = null;
        }

        // テキスト変更時の処理: 速度表示が変わったら data-changed を一定時間付ける
        async markDraggableChanged() {
            const draggable = this.draggable;
            if (!draggable || !draggable.isConnected) return;

            const text = draggable.textContent;
            if (this.draggableText === text) return;

            try {
                this.draggableText = text;

                if (!draggable.dataset.changed) {
                    draggable.dataset.changed = DATASET_ON_VALUE;
                }

                clearTimeout(this.draggableChangedTimer);
                this.draggableChangedTimer = setTimeout(() => {
                    delete draggable.dataset.changed;
                }, DRAGGABLE_CHANGED_DURATION_MS);
            } catch (error) {
                console.warn(`mark draggable changed: ${error}`);
            }
        }

        // 速度表示の監視を開始する
        observeDraggable() {
            try {
                this.observer = new MutationObserver(() =>
                    this.markDraggableChanged(),
                );
                this.observer.observe(this.draggable, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                });
            } catch (error) {
                console.warn(`observe draggable error: ${error}`);
                this.disposeObserver();
            }
        }

        // Draggable を更新する。変更があれば Observer を破棄して参照を差し替える。
        // 要素に変更があり監視に必要な要素が揃っていれば true
        async refreshDraggable() {
            const shadowRoot = this.hostController?.shadowRoot ?? null;

            if (!shadowRoot) {
                this.disposeObserver();
                this.shadowRoot = null;
                return false;
            }

            const draggable = shadowRoot.querySelector(draggableSelector);

            const changed =
                (this.shadowRoot !== shadowRoot ||
                    this.draggable !== draggable) &&
                !!draggable;

            if (changed) {
                this.disposeObserver();
                this.shadowRoot = shadowRoot;
                this.draggable = draggable;
            }

            // 一旦ブラウザに制御を返せるなら返す
            await yieldToBrowser();

            return changed;
        }

        /*
         * Amazon の場合 hostController に z-index を適用する
         */
        applyAmazonHostControllerZIndex() {
            if (!isAmazon) {
                return;
            }
            const controller = this.hostController;
            if (controller.dataset[appliedPropertyKey]) {
                return;
            }
            try {
                controller.style.setProperty(
                    "z-index",
                    `${AMAZON_VSC_Z_INDEX}`,
                    "important",
                );
                controller.dataset[appliedPropertyKey] = DATASET_ON_VALUE;
            } catch (error) {
                console.warn(
                    `apply amazon host controller z-index error: ${error}`,
                );
            }
        }

        // 謎の遅延対策
        async applyShadowControllerOpacity() {
            const shadowRoot = this.hostController?.shadowRoot;
            if (!shadowRoot || !shadowRoot.isConnected) return;

            const controller = shadowRoot?.querySelector(
                `${shadowControllerSelector}:not([data-${appliedPropertyKey}])`,
            );
            if (!controller) return;
            try {
                controller.style.setProperty("opacity", "1", "important");
                controller.dataset[appliedPropertyKey] = DATASET_ON_VALUE;
            } catch (error) {
                console.warn(`apply controller opacity error: ${error}`);
            }
            // 一旦ブラウザに制御を返せるなら返す
            await yieldToBrowser();
        }

        /*
         * shadowRoot 内の対象に dataset を付与する
         * まだ付いていない要素だけを検索する
         * rules: [{ selector, key }]  →  data-<key>="on"
         */
        async applyDatasets() {
            const shadowRoot = this.hostController?.shadowRoot;
            if (!shadowRoot || !shadowRoot.isConnected) return;

            for (const { selector, key } of datasetRules) {
                try {
                    const targets = shadowRoot.querySelectorAll(
                        `${selector}:not([data-${key}])`,
                    );
                    for (const element of targets) {
                        element.dataset[key] = DATASET_ON_VALUE;
                    }
                    // 一旦ブラウザに制御を返せるなら返す
                    await yieldToBrowser();
                } catch (error) {
                    console.warn(`apply dataset error (${key}): ${error}`);
                }
                if (!shadowRoot.isConnected) return;
            }
        }

        /*
         * shadowRoot に <style> を一度だけ適用する
         */
        async applyShadowRootStyle() {
            const shadowRoot = this.hostController?.shadowRoot;
            if (!shadowRoot || !shadowRoot.isConnected) return;
            if (shadowRoot.getElementById(SHADOW_ROOT_STYLE_ID)) return;

            try {
                const style = document.createElement("style");
                style.id = SHADOW_ROOT_STYLE_ID;
                style.textContent = shadowRootStyleCSS;

                shadowRoot.appendChild(style);
            } catch (error) {
                console.warn(`apply shadowroot style error: ${error}`);
            }
            // 一旦ブラウザに制御を返せるなら返す
            await yieldToBrowser();
        }
    }

    /*
     * すべての VSC(shadowRoot) の初期化と同期
     */
    async function syncState() {
        for (const [hostController, state] of vscStates) {
            // 切り離されている場合は次回の poll で削除される
            if (!hostController.isConnected) continue;

            // shadowRoot ごとのスタイルを適用する
            await state.applyShadowRootStyle();

            // dataset は監視対象の有無に関係なく先に付与する
            // (button などが span.draggable より遅れて描画されても付けられるように)
            await state.applyDatasets();

            // 謎の遅延対策
            await state.applyShadowControllerOpacity();

            // Amazon の協調表示用 z-index の設定
            state.applyAmazonHostControllerZIndex();

            // 対象要素が新しくなり監視が必要になれば呼び出す
            if (await state.refreshDraggable()) {
                state.observeDraggable();
            }
        }
    }

    /*
     * VSC(host controller) の同期
     */
    async function syncHostControllers() {
        const controllers = document.querySelectorAll(hostControllerSelector);
        const activeControllers = new Set(controllers);

        // DOM から削除された VSC の状態を破棄する
        for (const [controller, state] of vscStates) {
            if (!activeControllers.has(controller)) {
                state.dispose();
                vscStates.delete(controller);
            }
        }

        // 存在するすべての VSC を登録する
        for (const controller of controllers) {
            if (!vscStates.has(controller)) {
                const state = new VSCState(controller);
                vscStates.set(controller, state);
            }
        }

        // 一旦ブラウザに制御を返せるなら返す
        await yieldToBrowser();
    }

    /*
     * <html> に Amazon用の <style> を一度だけ適用する
     */
    async function applyAmazonStyle() {
        if (!document.querySelector(amazonPlayerSelector)) {
            return;
        }
        if (document.getElementById(AMAZON_STYLE_ID)) {
            return;
        }
        try {
            const style = document.createElement("style");
            style.id = AMAZON_STYLE_ID;
            style.textContent = amazonDocumentStyleCSS;
            document.documentElement.appendChild(style);
            isAmazon = true;
            await yieldToBrowser();
        } catch (error) {
            console.warn(`apply amazon style error: ${error}`);
        }
    }

    /*
     * すべての VSC を検出して状態を同期する
     */
    async function poll() {
        try {
            await applyAmazonStyle();
            await syncHostControllers();
            await syncState();
        } catch (error) {
            console.warn(`poll error: ${error}`);
        }
        await yieldToBrowser();
    }

    /*
     * 一度ブラウザに制御を返し、新しいタスクとして処理を再開する
     *
     * 描画やページ側の処理が割り込めるようにするため
     * 重い検索の直前で呼び出す
     */
    async function yieldToBrowser() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    /*
     * 短い間隔で呼ばれ現在が nextPollTime を過ぎていれば poll を呼び出す
     */
    async function tick() {
        if (performance.now() < nextPollTime) return;
        // 重複実行させない
        nextPollTime = Infinity;
        try {
            await poll();
        } catch (error) {
            console.error(`tick error: ${error}`);
        } finally {
            nextPollTime = performance.now() + POLL_INTERVAL_MS;
        }
    }

    // 短い間隔で呼び続ける
    setInterval(tick, TICK_INTERVAL_MS);

    if (DEBUG_MODE) {
        console.log(shadowRootStyleCSS);
    }
})();
