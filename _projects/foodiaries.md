---
layout: project
title: "Food Diaries"
permalink: /projects/foodiaries/
subtitle: "A Visual Documentation of Culinary Discoveries"
date: 2024-06-02
type: "Personal Project"
venue: "Independent"
location: "Global"
year: "2024"
image: "images/food-diary.gif"
authors: "<strong>Meltem Sahin Ozkoc</strong>"
website: "https://www.instagram.com/oncekahvem/"
---

<div class="food-diaries-container">
  <div class="food-header">
    <h1 class="food-main-title">Selected foods and comments</h1>
    <p class="food-subtitle">A visual journey through global cuisines. I wanted to document all the delicious dishes I've eaten during my travels and daily life. This collection captures the flavors, stories, and cultures behind every meal, from street food gems to fine dining experiences.</p>
  </div>

  <div class="filter-container">
    <div class="filter-section">
      <span class="filter-label">All:</span>
      <button class="filter-btn" onclick="filterFood('all')">All Foods</button>
    </div>
    
    <div class="filter-section">
      <span class="filter-label">By Region:</span>
      <button class="filter-btn" onclick="filterFood('europe')">Europe</button>
      <button class="filter-btn" onclick="filterFood('asia')">Asia</button>
      <button class="filter-btn" onclick="filterFood('america')">America</button>
    </div>
    
    <div class="filter-section">
      <span class="filter-label">By City:</span>
      <button class="filter-btn" onclick="filterFood('istanbul')">Istanbul</button>
      <button class="filter-btn" onclick="filterFood('pittsburgh')">Pittsburgh</button>
      <button class="filter-btn" onclick="filterFood('tokyo')">Tokyo</button>
    </div>
    
    <div class="filter-section">
      <span class="filter-label">By Type:</span>
      <button class="filter-btn" onclick="filterFood('main')">Main Dishes</button>
      <button class="filter-btn" onclick="filterFood('dessert')">Desserts</button>
      <button class="filter-btn" onclick="filterFood('drink')">Drinks</button>
    </div>
  </div>

  <div class="food-grid">
    
    <div class="food-card">
      <div class="food-image-container">
        <img src="/images/food/baklava.jpg" alt="Baklava" class="food-image">
      </div>
      <div class="food-content">
        <h3 class="food-title">Baklava</h3>
        <p class="food-restaurant">Güllüoğlu</p>
        <p class="food-price">₺15</p>
        <span class="location-tag">Istanbul</span>
      </div>
    </div>

    <div class="food-card">
      <div class="food-image-container">
        <img src="/images/food/burger.jpg" alt="Smash Burger" class="food-image">
      </div>
      <div class="food-content">
        <h3 class="food-title">Smash Burger</h3>
        <p class="food-restaurant">Shake Shack</p>
        <p class="food-price">$12.99</p>
        <span class="location-tag">Pittsburgh</span>
      </div>
    </div>

    <div class="food-card">
      <div class="food-image-container">
        <img src="/images/food/ramen.jpg" alt="Tonkotsu Ramen" class="food-image">
      </div>
      <div class="food-content">
        <h3 class="food-title">Tonkotsu Ramen</h3>
        <p class="food-restaurant">Ichiran</p>
        <p class="food-price">¥980</p>
        <span class="location-tag">Tokyo</span>
      </div>
    </div>


  </div>

  <div class="food-footer">
    <p>Follow more food adventures on <a href="https://www.instagram.com/oncekahvem/" target="_blank">Instagram @oncekahvem</a></p>
  </div>
</div> 