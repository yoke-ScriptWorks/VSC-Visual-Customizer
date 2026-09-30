// ==UserScript==
// @name          VSC Visual Customizer
// @namespace     https://github.com/yoke-ScriptWorks/VSC-Visual-Customizer
// @version       1.0.260930
// @description   VSC Visual Customizer
// @author        yoke
// @match         https://*.amazon.co.jp/*
// @match         https://*.twitch.tv/*
// @match         https://*.youtube.com/*
// @run-at        document-end
// @grant         none
// @updateURL     https://raw.githubusercontent.com/yoke-ScriptWorks/VSC-Visual-Customizer/main/vsc-visual-customizer.user.js
// @downloadURL   https://raw.githubusercontent.com/yoke-ScriptWorks/VSC-Visual-Customizer/main/vsc-visual-customizer.user.js
// ==/UserScript==

(function () {
    "use strict";
    let draggableInnerText = "";

    const DRAGGABLE_CHANGED_DURATION = 5000;
    const STYLE_CHANGE_IGNORE_TIME = 500;
    const OBSERVER_HEALTH_CHECK_INTERVAL = 5000;

    let draggableChangedTimer = null;
    let styleObserverResumeTimer = null;

    let shadowRoot = null;
    let controller = null;
    let draggable = null;
    let buttons = [];

    let textObserver = null;
    let styleObserver = null;

    /*
     * ------------------------------------------------------------
     * Style
     * ------------------------------------------------------------
     */

    /*
     * ShadowRootにカスタムスタイルを追加する
     * 既に存在する場合は追加しない
     */
    function applyCustomStyle() {
        if (!shadowRoot) return;

        if (!shadowRoot.querySelector("#custom-style")) {
            const style = document.createElement("style");
            style.id = "custom-style";
            style.textContent = `
                /*
                 * controllerのopacityはcssで指定すると謎の遅延が発生するので
                 * controller変数に要素を保存したときに要素のstyleプロパティで指定している
                 */
                .custom-controller
                {
                    background: transparent !important;
                    padding: 0.1em 0.25em !important;
                    margin: 0.25em 0.5em !important;
                    border: none !important;
                }
                .custom-draggable
                {
                    opacity: 1 !important;
                    color: rgb(255 255 255 / 16.5%) !important;
                    background: transparent !important;
                    padding: 0.05em 0.35em !important;
                    margin: 0em 0.25em !important;
                    border: none !important;
                }
                .custom-draggable-changed,
                .custom-draggable:hover
                {
                    color: rgb(255 255 255 / 45%) !important;
                    background: rgb(0 0 0 / 22.5%) !important;
                }
                .custom-button
                {
                    opacity: 1 !important;
                    color: rgb(255 255 255 / 45%) !important;
                    background: rgb(0 0 0 / 22.5%) !important;
                    padding: 0.05em 0.25em !important;
                    margin: 0em 0.25em !important;
                    border: none !important;
                }
                .custom-button:hover
                {
                    color: rgb(0 0 0 / 45%) !important;
                    background: rgb(255 255 255 / 22.5%) !important;
                }
            `;
            shadowRoot.appendChild(style);
        }
    }

    /*
     * ------------------------------------------------------------
     * Style Observer
     * ------------------------------------------------------------
     */

    /*
     * Style Observerを停止する
     */
    function stopStyleObserver() {
        if (!styleObserver) return;
        styleObserver.disconnect();
    }

    /*
     * Style Observerを開始する
     */
    function startStyleObserver() {
        if (!styleObserver) return;

        styleObserver.observe(shadowRoot, {
            attributes: true,
            attributeFilter: ["class"],
            subtree: true,
        });
    }

    /*
     * Style Observerを一時停止し、一定時間後に再開する
     *
     * 再開時には、停止中に変更された可能性のある
     * 各要素のclassNameを現在の状態に合わせて設定する
     */
    function suppressStyleObserver() {
        stopStyleObserver();

        const lastShadowRoot = shadowRoot;

        clearTimeout(styleObserverResumeTimer);

        styleObserverResumeTimer = setTimeout(() => {
            if (lastShadowRoot !== shadowRoot) return;

            styleObserverResumeTimer = null;

            applyAllClasses();
            startStyleObserver();
        }, STYLE_CHANGE_IGNORE_TIME);
    }

    /*
     * ------------------------------------------------------------
     * Class
     * ------------------------------------------------------------
     */

    /*
     * controllerのclassNameを設定する
     */
    function applyControllerClass() {
        if (!controller) return;
        if (controller.className !== "custom-controller") {
            controller.className = "custom-controller";
            /*
             * opacityをcssで指定すると遅延が発生するのでstyleに直接指定する
             */
            controller.style.setProperty("opacity", "1", "important");
        }
    }

    /*
     * Style Observerを一時停止してからcontrollerのclassNameを設定する
     */
    function restoreControllerClass() {
        if (!controller) return;

        suppressStyleObserver();
        applyControllerClass();
    }

    /*
     * draggableの状態に応じてclassNameを設定する
     *
     * changedタイマーが動作中ならchanged状態、
     * それ以外なら通常状態にする
     */
    function applyDraggableClass() {
        if (!draggable) return;

        if (draggableChangedTimer === null) {
            if (draggable.className !== "custom-draggable") {
                draggable.className = "custom-draggable";
            }
        } else {
            if (draggable.className !== "custom-draggable-changed") {
                draggable.className = "custom-draggable-changed";
            }
        }
    }

    /*
     * Style Observerを一時停止してからdraggableのclassNameを設定する
     */
    function restoreDraggableClass() {
        if (!draggable) return;

        suppressStyleObserver();
        applyDraggableClass();
    }

    /*
     * すべてのbuttonにclassNameを設定する
     */
    function applyButtonClasses() {
        if (!buttons.length) return;

        buttons.forEach((button) => {
            if (button.className !== "custom-button") {
                button.className = "custom-button";
            }
        });
    }

    /*
     * Style Observerを一時停止してからbuttonのclassNameを設定する
     */
    function restoreButtonClasses() {
        if (!buttons.length) return;

        suppressStyleObserver();
        applyButtonClasses();
    }

    /*
     * すべての対象要素のclassNameを現在の状態に合わせて設定する
     */
    function applyAllClasses() {
        applyControllerClass();
        applyDraggableClass();
        applyButtonClasses();
    }

    /*
     * ------------------------------------------------------------
     * Text Change Handling
     * ------------------------------------------------------------
     */

    /*
     * draggableのchanged状態を解除するタイマーを設定する
     *
     * タイマーが動作してない状態の呼び出しであればスタイルを変更
     * 最後のテキスト変更から一定時間後に再度スタイルを変更
     */
    function scheduleDraggableRestore() {
        const lastShadowRoot = shadowRoot;
        const lastDraggableChangedTimer = draggableChangedTimer;

        clearTimeout(draggableChangedTimer);

        draggableChangedTimer = setTimeout(() => {
            if (lastShadowRoot !== shadowRoot) return;

            draggableChangedTimer = null;

            restoreDraggableClass();
        }, DRAGGABLE_CHANGED_DURATION);

        if (lastDraggableChangedTimer === null) {
            restoreDraggableClass();
        }
    }

    /*
     * draggableのテキスト変更を処理する
     */
    function handleDraggableTextChange() {
        if (!draggable) return;

        const lastInnerText = draggable.innerText;

        if (lastInnerText === draggableInnerText) return;

        draggableInnerText = lastInnerText;

        scheduleDraggableRestore();
    }

    /*
     * ------------------------------------------------------------
     * Style Mutation Handling
     * ------------------------------------------------------------
     */

    /*
     * class属性の変更を処理する
     *
     * 対象要素のclassNameが外部から変更された場合、
     * 本来のclassNameへ戻す
     */
    function handleClassMutation(mutations) {
        if (!shadowRoot) return;

        for (const mutation of mutations) {
            if (mutation.type !== "attributes") {
                continue;
            }

            if (mutation.attributeName !== "class") {
                continue;
            }

            const target = mutation.target;

            /*
             * controller
             */
            if (target === controller) {
                restoreControllerClass();
                continue;
            }

            /*
             * draggable
             */
            if (target === draggable) {
                restoreDraggableClass();
                continue;
            }

            /*
             * button
             */
            if (buttons.includes(target)) {
                restoreButtonClasses();
            }
        }
    }

    /*
     * ------------------------------------------------------------
     * MutationObservers
     * ------------------------------------------------------------
     */

    /*
     * MutationObserverを停止して破棄する
     */
    function disposeTextObserver() {
        if (textObserver) {
            textObserver.disconnect();
            textObserver = null;
        }
    }

    function disposeStyleObserver() {
        if (styleObserver) {
            styleObserver.disconnect();
            styleObserver = null;
        }
    }

    /*
     * draggable以下のテキスト変更を監視するObserverを生成する
     */
    function createTextObserver() {
        disposeTextObserver();

        if (!draggable) return;

        textObserver = new MutationObserver(() => {
            handleDraggableTextChange();
        });

        textObserver.observe(draggable, {
            subtree: true,
            childList: true,
            characterData: true,
        });
    }

    /*
     * ShadowRoot以下のclass属性変更を監視するObserverを生成する
     */
    function createStyleObserver() {
        disposeStyleObserver();

        styleObserver = new MutationObserver((mutations) => {
            handleClassMutation(mutations);
        });

        startStyleObserver();
    }

    /*
     * ------------------------------------------------------------
     * DOM取得 / 保存
     * ------------------------------------------------------------
     */

    /*
     * 現在の.vsc-controllerからShadowRootを取得する
     */
    function getCurrentShadowRoot() {
        const vscController = document.querySelector(".vsc-controller");

        if (!vscController) return null;
        if (!vscController.shadowRoot) return null;

        return vscController.shadowRoot;
    }

    /*
     * ShadowRootから対象要素を取得して変数へ保存する
     */
    function cacheElements() {
        if (!shadowRoot) return false;

        controller = shadowRoot.querySelector("#controller");

        draggable = shadowRoot.querySelector("span.draggable");

        buttons = Array.from(shadowRoot.querySelectorAll("button"));

        if (!controller || !draggable || !buttons.length) {
            controller = null;
            draggable = null;
            buttons = [];

            return false;
        }

        draggableInnerText = draggable.innerText;

        return true;
    }

    /*
     * ------------------------------------------------------------
     * Observer / Timer Cleanup
     * ------------------------------------------------------------
     */

    /*
     * すべてのMutationObserverを停止して破棄する
     */
    function disconnectAllObservers() {
        disposeTextObserver();
        disposeStyleObserver();
    }

    /*
     * すべてのタイマーを解除する
     */
    function clearAllTimers() {
        clearTimeout(draggableChangedTimer);
        clearTimeout(styleObserverResumeTimer);

        draggableChangedTimer = null;
        styleObserverResumeTimer = null;
    }

    /*
     * ------------------------------------------------------------
     * Setup
     * ------------------------------------------------------------
     */

    /*
     * 現在のShadowRootを取得し、
     * 対象要素・Style・MutationObserverを初期化する
     */
    function setup() {
        shadowRoot = getCurrentShadowRoot();

        if (!shadowRoot) return;

        /*
         * 対象要素を取得して保存する
         */
        if (!cacheElements()) {
            shadowRoot = null;
            return;
        }

        /*
         * カスタムStyleを適用する
         */
        applyCustomStyle();

        /*
         * MutationObserverを生成する
         */
        createTextObserver();
        createStyleObserver();

        /*
         * 対象要素のclassNameを初期状態に合わせる
         */
        restoreControllerClass();
        restoreDraggableClass();
        restoreButtonClasses();
    }

    /*
     * ------------------------------------------------------------
     * Reconnect
     * ------------------------------------------------------------
     */

    /*
     * 現在のObserverとタイマーを破棄して再接続する
     */
    function reconnect() {
        /*
         * 古いObserverとタイマーを破棄する
         */
        disconnectAllObservers();
        clearAllTimers();

        /*
         * 現在のShadowRootに対して再初期化する
         */
        setup();
    }

    /*
     * ------------------------------------------------------------
     * Health Check / Reconnect
     * ------------------------------------------------------------
     */

    /*
     * ShadowRootの生存状態を確認し、
     * 変更されている場合は再接続する
     */
    function checkAndReconnect() {
        const lastShadowRoot = getCurrentShadowRoot();

        /*
         * 同じShadowRootであればObserverを維持する
         */
        if (lastShadowRoot === shadowRoot) return;

        reconnect();
    }

    /*
     * ------------------------------------------------------------
     * Start
     * ------------------------------------------------------------
     */

    setup();

    setInterval(checkAndReconnect, OBSERVER_HEALTH_CHECK_INTERVAL);
})();
