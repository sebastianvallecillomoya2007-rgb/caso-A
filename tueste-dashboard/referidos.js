"use strict";

(() => {
  const REFERRAL_CODE = "MARA-7K2P";
  const META_SPEND = 4000;
  const AGENCY_FEE = 1000;
  const META_CUSTOMERS = 100;
  const REFERRAL_DISCOUNT = 8;
  const SAMPLE_COST = 1.6;
  const SUBSCRIPTION_BONUS = 5;
  const SUBSCRIPTION_SHARE = 0.15;
  const MILESTONE_REWARD = 5.44;
  const MILESTONE_SIZE = 3;
  const PILOT_REWARD = 16;
  const BASELINE_REFERRALS = 3;
  const TARGET_REFERRALS = 8;
  const state = {
    coffeeTried: false,
    referrals: 0,
    subscriptionReferrals: 0,
    view: "invite"
  };

  const $ = (id) => document.getElementById(id);

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function referralUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("ref", REFERRAL_CODE);
    url.hash = "amigo";
    if (url.protocol === "file:") return `referidos.html${url.search}${url.hash}`;
    return url.toString();
  }

  function setView(view) {
    const validViews = ["invite", "friend", "owner"];
    if (!validViews.includes(view)) return;
    state.view = view;
    document.querySelectorAll("[data-ref-view]").forEach((button) => {
      const selected = button.dataset.refView === view;
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", String(selected));
      }
    });
    document.querySelectorAll(".ref-view").forEach((panel) => {
      panel.hidden = panel.id !== `ref${view[0].toUpperCase()}${view.slice(1)}Panel`;
    });
  }

  function updateInviteView(message) {
    $("refShareLocked").hidden = state.coffeeTried;
    $("refShareReady").hidden = !state.coffeeTried;
    $("refTriedButton").hidden = state.coffeeTried;
    if (state.coffeeTried) {
      $("refInviteStatus").textContent = "Pedido recibido · café probado";
      $("refInviteStatus").classList.add("ref-step-ready");
      $("refOrderMessage").textContent = "¡Qué bueno que ya lo probaste! Ahora puedes invitar a alguien.";
      $("refLink").value = referralUrl();
      const shareMessage = `¡Ya probé el café de Tueste y pensé en ti! Te regalo $8 en tu primera compra: ${referralUrl()}`;
      const currentUrl = new URL(window.location.href);
      const isPublicHttps = currentUrl.protocol === "https:"
        && !["localhost", "127.0.0.1", "::1"].includes(currentUrl.hostname);
      const shareLink = $("refWhatsAppLink");
      if (isPublicHttps) {
        const whatsapp = new URL("https://wa.me/");
        whatsapp.searchParams.set("text", shareMessage);
        shareLink.href = whatsapp.toString();
        shareLink.target = "_blank";
        shareLink.textContent = "Enviar por WhatsApp";
        shareLink.dataset.localDemo = "false";
      } else {
        shareLink.href = "#amigo";
        shareLink.removeAttribute("target");
        shareLink.textContent = "Simular envío por WhatsApp";
        shareLink.dataset.localDemo = "true";
      }
    } else {
      $("refInviteStatus").textContent = "Pedido en camino · día 1 de 3";
      $("refInviteStatus").classList.remove("ref-step-ready");
      $("refOrderMessage").textContent = "Tu café llega en unos días. Te avisaremos para invitar cuando lo hayas probado.";
    }
    if (message) $("refInviteMessage").textContent = message;
  }

  function updateFriendPrice() {
    const subscription = $("refFriendOrder").value === "subscription";
    const price = subscription ? 30.6 : 34;
    $("refOriginalPrice").textContent = money(price);
    $("refFinalPrice").textContent = money(price - REFERRAL_DISCOUNT);
    $("refPriceNote").textContent = subscription
      ? "Primer mes de suscripción cancelable · antes de impuestos, si aplican"
      : "Pedido único · antes de impuestos, si aplican";
  }

  function updateRewards() {
    const milestones = Math.floor(state.referrals / MILESTONE_SIZE);
    const rewardCost = state.referrals * (REFERRAL_DISCOUNT + SAMPLE_COST)
      + state.subscriptionReferrals * SUBSCRIPTION_BONUS
      + milestones * MILESTONE_REWARD;
    const progress = state.referrals === 0
      ? 0
      : ((state.referrals - 1) % MILESTONE_SIZE) + 1;
    $("refProgressText").textContent = `${progress} de ${MILESTONE_SIZE} compras referidas`;
    $("refProgressBar").setAttribute("aria-valuenow", String(progress));
    $("refProgressFill").style.width = `${(progress / MILESTONE_SIZE) * 100}%`;
    $("refDemoPurchaseCount").textContent = String(state.referrals);
    $("refDemoRewardCost").textContent = money(rewardCost);
    if (state.referrals > 0) {
      let notice = `Compra simulada confirmada. Desbloqueaste una muestra de 100 g (costo $${SAMPLE_COST.toFixed(2)}).`;
      if (state.subscriptionReferrals > 0) {
        notice += ` También hay ${state.subscriptionReferrals} bono(s) de $5 por suscripción.`;
      }
      if (state.referrals % MILESTONE_SIZE === 0) {
        notice += ` Llegaste a ${state.referrals}: se desbloqueó una bolsa de 340 g (costo $${MILESTONE_REWARD.toFixed(2)}).`;
      }
      $("refInviterNotice").textContent = notice;
      $("refInviterNotice").hidden = false;
    }
  }

  function renderGrowthMath() {
    const paidCac = (META_SPEND + AGENCY_FEE) / META_CUSTOMERS;
    const rewardCap = paidCac / 2;
    const expectedReward = REFERRAL_DISCOUNT + SAMPLE_COST
      + SUBSCRIPTION_SHARE * SUBSCRIPTION_BONUS
      + MILESTONE_REWARD / MILESTONE_SIZE;
    const worstCaseReward = REFERRAL_DISCOUNT + SAMPLE_COST
      + SUBSCRIPTION_BONUS + MILESTONE_REWARD / MILESTONE_SIZE;
    const currentBlend = ((100 - BASELINE_REFERRALS) * paidCac
      + BASELINE_REFERRALS * PILOT_REWARD) / 100;
    const goalBlend = ((100 - TARGET_REFERRALS) * paidCac
      + TARGET_REFERRALS * expectedReward) / 100;
    const change = currentBlend - goalBlend;
    const changePercent = change / currentBlend * 100;

    $("refPaidCac").textContent = money(paidCac);
    $("refRewardCap").textContent = money(rewardCap);
    $("refExpectedRewardCost").textContent = money(expectedReward);
    $("refWorstRewardCost").textContent = money(worstCaseReward);
    $("refBlendCurrent").textContent = money(currentBlend);
    $("refBlendGoal").textContent = money(goalBlend);
    $("refBlendChange").textContent = `−${money(change)} / alta (−${changePercent.toFixed(1)}%)`;
    $("refRewardCapCheck").textContent = expectedReward <= rewardCap && worstCaseReward <= rewardCap
      ? `Costo esperado y peor caso dentro del límite de ${money(rewardCap)}.`
      : `El costo excede el límite de ${money(rewardCap)}; hay que rediseñar las recompensas.`;
    $("refRewardCapCheck").parentElement.classList.toggle(
      "ref-cap-fail",
      expectedReward > rewardCap || worstCaseReward > rewardCap
    );
  }

  async function copyReferralLink() {
    const linkInput = $("refLink");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(linkInput.value);
      } else {
        linkInput.focus();
        linkInput.select();
        const copied = document.execCommand("copy");
        linkInput.setSelectionRange(0, 0);
        if (!copied) throw new Error("El navegador no permitió copiar el enlace.");
      }
      updateInviteView("Enlace copiado. Pégalo en un mensaje para tu amigo.");
    } catch (error) {
      console.error("No se pudo copiar el enlace de referido.", error);
      linkInput.focus();
      linkInput.select();
      updateInviteView("No se pudo copiar automáticamente. Selecciona el enlace y cópialo.");
    }
  }

  function completePurchase() {
    if ($("refCompletePurchase").disabled) return;
    const isSubscription = $("refFriendOrder").value === "subscription";
    state.referrals += 1;
    if (isSubscription) state.subscriptionReferrals += 1;
    $("refCompletePurchase").textContent = "Registrar otra compra referida simulada";
    const reward = isSubscription
      ? "Mara recibe una muestra de 100 g y $5 de saldo por tu suscripción."
      : "Mara recibe una muestra de 100 g para su próximo envío.";
    $("refFriendResult").textContent = `¡Listo! Tu descuento de $8 quedó aplicado. ${reward} El aviso y las recompensas son simulados.`;
    $("refFriendResult").hidden = false;
    updateRewards();
  }

  function resetDemo() {
    state.coffeeTried = false;
    state.referrals = 0;
    state.subscriptionReferrals = 0;
    $("refFriendOrder").value = "loose";
    $("refCompletePurchase").disabled = false;
    $("refCompletePurchase").textContent = "Confirmar compra simulada";
    $("refFriendResult").hidden = true;
    $("refInviterNotice").hidden = true;
    $("refInviteMessage").textContent = "";
    updateInviteView();
    updateFriendPrice();
    updateRewards();
    setView("invite");
  }

  function init() {
    document.querySelectorAll("[data-ref-view]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.refView));
    });
    $("refTriedButton").addEventListener("click", () => {
      state.coffeeTried = true;
      updateInviteView("Enlace listo. Ahora puedes compartirlo por WhatsApp o copiarlo.");
    });
    $("refCopyButton").addEventListener("click", copyReferralLink);
    $("refWhatsAppLink").addEventListener("click", (event) => {
      if ($("refWhatsAppLink").dataset.localDemo !== "true") return;
      event.preventDefault();
      setView("friend");
      updateInviteView("Invitación enviada en la demostración. Tu amigo ya puede ver su regalo.");
    });
    $("refFriendOrder").addEventListener("change", updateFriendPrice);
    $("refCompletePurchase").addEventListener("click", completePurchase);
    $("refResetButton").addEventListener("click", resetDemo);
    updateFriendPrice();
    updateRewards();
    renderGrowthMath();
    const params = new URLSearchParams(window.location.search);
    setView(params.has("ref") || window.location.hash === "#amigo" ? "friend" : "invite");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
