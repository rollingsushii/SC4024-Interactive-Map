// Initialize the map
let originalView = [46.88, 4.4]; 
let originalZoom = 4;
const map = L.map('map').setView(originalView, originalZoom);


// Add minimalistic base layer from Stamen Toner Lite
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);


let stadiums = [];
let selectedStadium = null;
let connections = []; 
let drawnTeamNames = [];
let labelledCountries = [];
let highlightedLine = null;
let drawnCircles = [];


// Zoom out button refreshes the entire webpage
document.getElementById('zoom-out-button').addEventListener('click', () => {
    location.reload();
});


// For centering the map
const countryCentroids = {
    "France": [46.6034, 1.8883], 
    "Germany": [51.1657, 10.4515], 
    "Spain": [40.4637, -3.7492], 
    "United Kingdom": [55.3781, -3.4360], 
    "Italy": [41.8719, 12.5674] 
};


// Load stadium data and initialize the map
d3.json("stadium_data.json").then(data => {
    stadiums = data;
    console.log("Stadium data loaded:", stadiums);
    console.log("Number of stadiums:", data.length);
    const countryWinRates = calculateCountryWinRates(stadiums);
    drawCountries(countryWinRates); // Draw countries with win rates
    populateWinRateTable(countryWinRates, "N.A", "Home Win Rate per Country");
}).catch(error => {
    console.error("Error loading stadium data:", error);
});


// Function to calculate win rates by country
function calculateCountryWinRates(stadiums) {
    const countryTotals = {};

    stadiums.forEach(stadium => {
        const country = stadium.country;

        if (!countryTotals[country]) {
            countryTotals[country] = { homeWins: 0, totalGames: 0 };
        }

        if (stadium.home_games && stadium.home_games.total_games > 0) {
            countryTotals[country].homeWins += stadium.home_games.win_rate * stadium.home_games.total_games;
            countryTotals[country].totalGames += stadium.home_games.total_games;
        }
    });

    const countryWinRates = {};
    for (const country in countryTotals) {
        const { homeWins, totalGames } = countryTotals[country];
        const homeWinRate = totalGames > 0 ? (homeWins / totalGames) * 100 : 0;
        countryWinRates[country] = { totalGames, homeWinRate }; 
    }

    console.log("Calculated country win rates:", countryWinRates);
    return countryWinRates;
}


// Function to draw countries on the map, coloured by win rate
function drawCountries(countryWinRates) {
    d3.json("countries.geojson").then(geoData => {
        console.log("Loaded GeoJSON data:", geoData);

        // Rank countries by their home win rates
        const rankedCountries = Object.entries(countryWinRates)
            .sort(([, a], [, b]) => b.homeWinRate - a.homeWinRate)
            .map(([country]) => country);

        const maxRank = rankedCountries.length;
        const highestCountry = rankedCountries[0];
        const lowestCountry = rankedCountries[maxRank - 1];

        countriesLayer = L.geoJson(geoData, {
            style: feature => styleCountry(feature, countryWinRates, maxRank, rankedCountries),
            onEachFeature: (feature, layer) => {
                const country = feature.properties.NAME; 
                const winRate = countryWinRates[country]?.homeWinRate;

                if (winRate !== undefined) {
                    layer.bindTooltip(`${country}: ${winRate.toFixed(2)}% Home Wins`);
                    addMarker(layer, country, winRate, highestCountry, lowestCountry); 
                    console.log(`Tooltip for ${country}: ${winRate.toFixed(2)}%`);
                } else {
                    console.warn(`No win rate data for country: ${country}`);
                }
            }
        }).addTo(map);
    }).catch(error => console.error("Error loading GeoJSON data:", error));
}


// Function to style countries based on home win percentage and ranking
function styleCountry(feature, countryWinRates, maxRank, rankedCountries) {
    const country = feature.properties.NAME; 
    const winRate = countryWinRates[country]?.homeWinRate || 0;

    console.log(`Styling country ${country} with win rate: ${winRate}`);
    const rank = rankedCountries.indexOf(country);

    let color;
    if (rank >= 0) {
        const intensity = (maxRank - rank) / maxRank; 
        color = d3.interpolateGreens(intensity);
    } else {
        color = '#f0f0f0'; 
    }

    return {
        color: 'grey',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.7
    };
}


// Function to add a marker for the country name and win rate
function addMarker(layer, country, winRate, highestCountry, lowestCountry) {
    const centroid = countryCentroids[country];

    let color;
    if (country === highestCountry) {
        color = "green";
    } else if (country === lowestCountry) {
        color = "red"; 
    } else {
        color = "black"; 
    }

    if (centroid) {
        const marker = L.marker(centroid, {
            icon: L.divIcon({
                className: 'country-marker',
                html: `<div style="text-align: center; background-color: white; padding: 5px; border-radius: 5px; box-shadow: 0px 0px 5px rgba(0, 0, 0, 0.3);">
                          <strong style="color: ${color};">${country}</strong><br> 
                          <span style="color: ${color};">${winRate.toFixed(2)}%</span>
                       </div>`,
                iconSize: [100, 40],
                iconAnchor: [50, 20]
            })
        }).addTo(map);
        labelledCountries.push(marker);
    } else {
        console.warn(`No centroid defined for ${country}`);
    }
}


// Function to add label marker
function addMarkerBelowStadium(stadium) {
    if (window.clickedMarker) {
        map.removeLayer(window.clickedMarker);
    }

    function getIconWidth(teamName) {
        const baseWidth = 6; 
        return Math.min((teamName.length * baseWidth), rad / 2); 
    }
    console.log('away stadium name', stadium.team);
    const iconWidth = getIconWidth(stadium.team);

    const radiusInDegrees = rad / 111139; 
    const teamNamePosition = [stadium.coordinates.lat-radiusInDegrees-0.01, stadium.coordinates.lon];

    const clickedNameIcon = L.divIcon({
        className: 'clicked-name-icon', 
        html: stadium.team,
        iconSize: [iconWidth, 16], 
        iconAnchor: [iconWidth/2, 0], 
        popupAnchor: [0, 0] 
    });

    const teamNameMarker = L.marker(teamNamePosition, { icon: clickedNameIcon }).addTo(map);
    window.clickedMarker = teamNameMarker; 
}


// Function to populate the table
function populateWinRateTable(countryWinRates, league, title) {
    console.log("populating the table");
    console.log('title is ', title);

    d3.select("#table-title").text(title);

    const tableBody = d3.select("#details-table tbody");
    const tableHead = d3.select("#details-table thead tr");

    tableBody.selectAll("tr").remove(); 
    tableHead.selectAll("th").remove(); 

    let tag = 0;

    if (Object.keys(countryWinRates).length > 0) {
        const sampleData = countryWinRates[Object.keys(countryWinRates)[0]]; 
        console.log('Sample Data:', sampleData); 
        
        if (sampleData.totalGames > 500){
            tableHead.append("th").text("Country");
            tag = 1;
        }

        Object.keys(sampleData).forEach(key => {
            let formattedHeader = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            console.log(formattedHeader)
            console.log('key', key)
            
            if (key.includes("away") && !key.includes("Rate")){
                tag = 3;
                tableHead.append("th").text("Away Stadium");
            }
            else if (key.includes("stadium")){
                tableHead.append("th").text("Team");
                tag = 2;
            }
            if (key.includes("Rate")) {
                formattedHeader += " (%)"; 
            }
            tableHead.append("th").text(formattedHeader).style("text-align", "center"); 
        });
    } else {
        console.warn('No data available to populate the table headers.'); 
    }
    console.log('final tag', tag);
    sortedData = Object.entries(countryWinRates).sort(([, a], [, b]) => b.homeWinRate - a.homeWinRate);
    if (tag == 3){
        
        sortedData = Object.entries(countryWinRates).sort(([, a], [, b]) => b.awayWinRate - a.awayWinRate);
    }

    const highestCountry = sortedData[0][0]; 
    const lowestCountry = sortedData[sortedData.length - 1][0];

    sortedData.forEach(([country, data]) => {
        const row = tableBody.append("tr");
        const color = (country == highestCountry) ? "green" : (country == lowestCountry) ? "red" : "black";

        if (tag == 2){
            row.append("td").text(country).style("color", color).on("click", () => {
                // Trigger the click event for the corresponding circle
                const circle = drawnCircles.find(c => c.stadiumData.team === country);
                if (circle) {
                    circle.fire('click'); // Fire the click event on the corresponding circle
                }
            });
        }
        else if (tag == 3){
            row.append("td").text(country).style("color", color).on("click", () => {
                const clickedStadium = country;
                const connectingLine = findConnectingLineByStadium(clickedStadium)
                       
                if (highlightedLine) {
                    highlightedLine.setStyle({ color: 'grey' }); 
                    console.log(`Connecting line for ${highlightedLine.stadium} colored grey.`);
                }

                if (connectingLine) {
                    connectingLine.line.setStyle({ color: 'orange' }); // Change the new line color
                    highlightedLine = connectingLine.line; 
                    highlightedLine.stadium = clickedStadium; 
                    console.log(`Connecting line for ${clickedStadium} colored orange.`);
                    
                    circle = findCircleByStadium(clickedStadium);
                    if (circle) {
                        addMarkerBelowStadium(circle.stadiumData); 
                    }
                } else {
                    console.warn(`Connecting line not found for: ${clickedStadium}`);
                }
            });
        }
        else{
            row.append("td").text(country).style("color", color)
        }

        if (tag == 1) {
            row.append("td").text(data.totalGames).style("color", color).style("text-align", "center");
            row.append("td").text((data.homeWinRate).toFixed(2) + '%').style("color", color).style("text-align", "center"); 
        } else if (tag == 2){
            row.append("td").text(data.stadiumTotalGames).style("color", color).style("text-align", "center"); 
            row.append("td").text((data.homeWinRate).toFixed(2) + '%').style("color", color).style("text-align", "center"); 
        } else if (tag == 3){
            row.append("td").text(data.awayStadiumTotalGames).style("color", color).style("text-align", "center"); 
            row.append("td").text((data.awayWinRate).toFixed(2) + '%').style("color", color).style("text-align", "center"); 
        }

        if (tag == 3) {
            console.log("back button appears");
            d3.select("#back-button")
                .style("display", "block"); 
            d3.select("#back-button").on("click", () => {
                resetToLeagueView(league); 
            });
        } else {
            d3.select("#back-button").style("display", "none");
        }
    });
}


// Helper function to find the plotted connecting line between 2 stadiums
function findConnectingLineByStadium(stadiumName) {
    const connection = connections.find(conn => conn.stadium === stadiumName);
    return connection ? connection : null; 
}


// Helper function for back button
function resetToLeagueView(league){
    d3.select("#back-button").style("display", "none");
    leagueButtons.forEach(button => {
        if (button.dataset.league === league) {
            button.classList.add('active');
        }
    });
    if (window.clickedMarker) {
        map.removeLayer(window.clickedMarker);
    }
    zoomToLeague(league);
}


// Helper function to remove country plot
function clearCountriesLayer() {
    if (countriesLayer) {
        map.removeLayer(countriesLayer); 
        countriesLayer = null; 
        console.log("Countries layer cleared.");
    }
}


// Draw stadiums on the map
function drawStadiums() {
    clearStadiums(); 

    stadiums.forEach(stadium => {
        const circleRadius = (stadium.country === "United Kingdom") ? 100 : 1000;

        const circle = L.circle([stadium.coordinates.lat, stadium.coordinates.lon], {
            radius: circleRadius,
            color: 'steelblue',
            fillColor: 'steelblue',
            fillOpacity: 1,
            className: 'stadium',
            zIndex: 100  
        }).addTo(map)
            .on('mouseover', showHoverTooltip)
            .on('mouseout', hideTooltip)
            .on('click', stadiumClicked);
        
        circle.stadiumData = stadium;
        drawnCircles.push(circle);

        console.log("Drawing stadium:", stadium);
        console.log("Attached stadiumData:", circle.stadiumData);
        console.log(circle.options);
    });
}


// Clear all drawn stadiums from the map
function clearStadiums() {
    drawnCircles.forEach(circle => map.removeLayer(circle));
    console.log("Cleared all stadium circles from the map.");
    drawnCircles = []; 
}


// Clear all team name markers from the map
function clearTeamNames() {
    drawnTeamNames.forEach(marker => map.removeLayer(marker));
    console.log("Cleared all team name markers from the map."); 
    drawnTeamNames = []; 
}


// Clear all country markers from the map
function clearLabelledCountries() {
    labelledCountries.forEach(marker => map.removeLayer(marker));
    console.log("Cleared all country markers from the map."); 
    labelledCountries = []; 
}


// Initialize the tooltip
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0); 


// Show tooltip on hover
function showHoverTooltip(event) {
    if (!this.stadiumData) {
        console.error("No stadium data found for this circle.");
        return;
    }

    const stadium = this.stadiumData;

    tooltip.html(`
        <div class="stadium-name">${stadium.stadium}</div>
        <div class="tooltip-text">
            Home Team: <b>${stadium.team}</b><br>
            Games Played: ${stadium.home_games.total_games}<br>
            Home Team <span style="color: green;">Win</span> Rate: <span style="color: green;">${(stadium.home_games.win_rate * 100).toFixed(2)}%</span><br>
            Home Team <span style="color: grey;">Draw</span> Rate: <span style="color: grey;">${(stadium.home_games.draw_rate * 100).toFixed(2)}%</span><br>
            Home Team <span style="color: #d50032;">Loss</span> Rate: <span style="color: #d50032;">${(stadium.home_games.loss_rate * 100).toFixed(2)}%</span><br>
        </div>
    `);
    
    const tooltipX = event.originalEvent.clientX + 10; 
    const tooltipY = event.originalEvent.clientY - 20; 

    tooltip.style("left", `${tooltipX}px`)
        .style("top", `${tooltipY}px`)
        .style("opacity", 1); 

    console.log(`Hovering over stadium: ${stadium.stadium}`);
}


// Hide tooltip
function hideTooltip() {
    tooltip.style("opacity", 0);
    tooltip.classed('visible', false); 
    console.log("Tooltip hidden."); 
}


// Zoom to selected league's country
function zoomToLeague(league) {
    const leagueStadiums = stadiums.filter(stadium => stadium.country === league);

    console.log(`Zooming into league: ${league}, with ${leagueStadiums.length} stadiums.`); 
    clearCountriesLayer();
    clearStadiums();
    clearConnections();
    clearTeamNames();
    clearLabelledCountries();

    const leagueWinRates = {};

    leagueStadiums.forEach(stadium => {
        const home_win_rate = stadium.home_games.win_rate; 
        const stadiumTotalGames = stadium.home_games.total_games;  
        const homeWinRate = home_win_rate * 100;           

        leagueWinRates[stadium.team] = { stadiumTotalGames, homeWinRate }; 
    });

    populateWinRateTable(leagueWinRates, league, "Home Win Rate for each Stadium");

    if (leagueStadiums.length > 0) {
        leagueStadiums.sort((a, b) => a.home_games.win_rate - b.home_games.win_rate); 

        leagueStadiums.forEach((stadium, index) => {
            const circleRadius = (stadium.country === "United Kingdom") ? 100 : 2000;
            const circleMultiplier = (stadium.country === "United Kingdom") ? 100 : 1000;
            const radius = circleRadius + (index * circleMultiplier);
            
            let color;
            if (index === 0) { 
                color = "red";
            } else if (index === leagueStadiums.length - 1) { 
                color = "green";
            } else {
                color = "steelblue";
            }
            const circle = L.circle([stadium.coordinates.lat, stadium.coordinates.lon], {
                radius: radius,
                color: color,
                fillColor: color,
                fillOpacity: 1,
                zIndex: 500, 
                className: 'stadium'
            }).addTo(map)
                .on('mouseover', showHoverTooltip)
                .on('mouseout', hideTooltip)
                .on('click', stadiumClicked);
            
            circle.stadiumData = stadium; 
            drawnCircles.push(circle); 
            circle.bringToFront();
        });

        const bounds = L.latLngBounds(leagueStadiums.map(stadium => [stadium.coordinates.lat, stadium.coordinates.lon]));
        map.fitBounds(bounds);
        console.log("Map zoomed to league bounds."); 
    }
}


// Initiliaze control over distance travelled legend
L.Control.ImageControl = L.Control.extend({
    onAdd: function(map) {
        this._div = L.DomUtil.create('div', 'image-control'); 
        this._div.style.width = '100px'; 
        this._div.style.height = '100px';
        this._div.style.position = 'absolute'; 
        this._div.style.top = '10px';
        this._div.style.right = '10px'; 
        this._div.style.zIndex = 1000;

        this.setImage('');
        return this._div;
    },
    setImage: function(imageUrl) {
        this._div.innerHTML = imageUrl ? `<img src="${imageUrl}" style="width: 100%; height: auto;">` : ''; 
    }
});


const imageControl = new L.Control.ImageControl();
imageControl.addTo(map);


// Handle stadium click event
function stadiumClicked(event) {
    if (!this.stadiumData) {
        console.error("No stadium data found for this circle.");
        return;
    }

    const imageUrl = 'Map Legend.png';
    imageControl.setImage(imageUrl);

    const stadium = this.stadiumData;
    const clickedCircle = this;
    const league = stadium.country;

    console.log(`Clicked on stadium: ${stadium.stadium}`);
    resetOtherStadiumColors(stadium); 

    console.log("Before setStyle:", clickedCircle.options);
    const rad = (stadium.country === "United Kingdom") ? 100 : 20000;

    clickedCircle.setStyle({ fillColor: 'orange', color: 'orange'});
    clickedCircle.setRadius(rad);

    function getIconWidth(teamName) {
        const baseWidth = 6;
        return Math.min((teamName.length * baseWidth), rad / 2);
    }

    const iconWidth = getIconWidth(stadium.team);

    const radiusInDegrees = rad / 111139; 
    const teamNamePosition = [stadium.coordinates.lat-radiusInDegrees-0.01, stadium.coordinates.lon];

    if (drawnTeamNames.length > 0) {
        drawnTeamNames.forEach(marker => map.removeLayer(marker));
        drawnTeamNames = []; 
    }

    const clickedNameIcon = L.divIcon({
        className: 'clicked-name-icon',
        html: stadium.team,
        iconSize: [iconWidth, 16], 
        iconAnchor: [iconWidth/2, 0], 
        popupAnchor: [0, 0]
    });

    const teamNameMarker = L.marker(teamNamePosition, { icon: clickedNameIcon }).addTo(map);
    drawnTeamNames.push(teamNameMarker);

    map.invalidateSize();

    updateCirclesWithVisitingData(stadium.visiting_stadiums); 

    const visitingWinRates = {};
    stadium.visiting_stadiums.forEach(visiting => {
        visitingWinRates[visiting.stadium] = {
            awayStadiumTotalGames: visiting.games_played,
            awayWinRate: visiting.away_win_rate * 100 
        };
    });

    populateWinRateTable(visitingWinRates, league, "Away Win Rate at other Stadiums"); 
    drawConnections(stadium);   
}


// Helper function to restore circle colours
function resetOtherStadiumColors(clickedStadium) {
    drawnCircles.forEach(circle => {
        const defaultRadius = (clickedStadium.country === "United Kingdom") ? 100 : 10000;
        circle.setRadius(defaultRadius);
        if (circle.stadiumData.stadium !== clickedStadium.stadium) {
            circle.setStyle({ color: 'steelblue', fillColor: 'steelblue' });
        }
    });
}


// Function to encode visiting stadiums data
function updateCirclesWithVisitingData(visitingStadiums) {
    clearCircleTooltips();

    visitingStadiums.sort((a, b) => a.away_win_rate - b.away_win_rate); 
    visitingStadiums.forEach((visiting, index) => {
        const circle = findCircleByStadium(visiting.stadium);
        const away_win_rate = visiting.away_win_rate * 100;
        const circleRadius = (visiting.country === "United Kingdom") ? 100 : 10000;
        const circleMultiplier = (visiting.country === "United Kingdom") ? 100 : 5000;

        if(visiting.games_played == 0){
            circle.setLatLng([visiting.coordinates.lat, visiting.coordinates.lon]);
            circle.setStyle({ color: 'steelblue' , fillColor: 'steelblue'});
            circle.setRadius(10000)
            circle.on('mouseover', (event) => {
                showVisitingTooltip(event, visiting); 
            });
            return
        }

        if (away_win_rate >= 50) {
            const size_ratio = (away_win_rate - 50) / 50; 
            rad = circleRadius + (size_ratio * circleMultiplier); 
        } else {
            const size_ratio = (away_win_rate - 50) / 50; 
            rad = circleRadius + (1 - size_ratio) * circleMultiplier; 
        }
        
        if (circle) {
            circle.setLatLng([visiting.coordinates.lat, visiting.coordinates.lon]);
            circle.setStyle({ color: 'steelblue' , fillColor: 'steelblue'});
            circle.setRadius(rad)

            let color;
            if (away_win_rate >= 50) {
                const intensity = (away_win_rate - 50) / 50; 
                const scaledIntensity = 0.5 + (intensity * 0.4) 
                const whiteAmount = Math.round(255 * (1 - scaledIntensity)); 
                const greenAmount = 200 - intensity*50

                color = `rgb(${whiteAmount}, ${greenAmount}, ${whiteAmount})`;
            } else {
                const intensity = away_win_rate / 50; 
                const scaledIntensity = 0.4 + ((1-intensity) * 0.6)
                const whiteAmount = Math.round(255 * (1 - scaledIntensity)); 
                const redAmount = 230 - intensity*20
                
                color = `rgb(${redAmount}, ${whiteAmount}, ${whiteAmount})`; 
            }

            circle.setStyle({ color: color, fillColor: color });
            console.log(`Away Win Rate: ${visiting.away_win_rate}, Color: ${color}`);
            
            circle.on('mouseover', (event) => {
                showVisitingTooltip(event, visiting);
            });
        } else {
            console.warn(`Circle for visiting stadium ${visiting.stadium} not found.`);
        }
    });
}


// Function to find a circle by its stadium name
function findCircleByStadium(stadiumName) {
    return drawnCircles.find(circle => circle.stadiumData.stadium === stadiumName);
}


// Draw connections to other stadiums
function drawConnections(clickedStadium) {
    clearConnections();
    console.log("clicked stadium:", clickedStadium);

    const visitingStadiums = clickedStadium.visiting_stadiums;
    const clickedRadius = (clickedStadium.country === "United Kingdom") ? 100 : 20000; 
    console.log("clicked radius:", clickedRadius);

    const clickedLatLng = [clickedStadium.coordinates.lat, clickedStadium.coordinates.lon];
    console.log("clicked lat lng:", clickedLatLng);

    visitingStadiums.forEach(visiting => {
        const visitingCircle = findCircleByStadium(visiting.stadium); 
        if (visitingCircle) {
            const visitingLatLng = [visiting.coordinates.lat, visiting.coordinates.lon];
            const visitingRadius = visitingCircle.getRadius() 
            console.log("visiting radius:", visitingRadius);

            const angle = Math.atan2(visiting.coordinates.lat - clickedStadium.coordinates.lat, visiting.coordinates.lon - clickedStadium.coordinates.lon);

            const clickedEdgePoint = [
                clickedLatLng[0] + (clickedRadius / 111139) * Math.sin(angle), 
                clickedLatLng[1] + (clickedRadius / (111139 * Math.cos(clickedLatLng[0] * Math.PI / 180))) * Math.cos(angle)
            ];

            const visitingEdgePoint = [
                visitingLatLng[0] - (visitingRadius / 111139) * Math.sin(angle), 
                visitingLatLng[1] - (visitingRadius / (111139 * Math.cos(visitingLatLng[0] * Math.PI / 180))) * Math.cos(angle) 
            ];

            console.log("Clicked Edge Point:", clickedEdgePoint);
            console.log("Visiting Edge Point:", visitingEdgePoint);

            if (isNaN(clickedEdgePoint[0]) || isNaN(clickedEdgePoint[1]) || 
                isNaN(visitingEdgePoint[0]) || isNaN(visitingEdgePoint[1])) {
                console.error("Invalid edge points:", clickedEdgePoint, visitingEdgePoint);
                return; 
            }

            let lineWeight = 1;
            if (visiting.games_played >= 20) {
                lineWeight = 5; 
            } else if (visiting.games_played >= 10) {
                lineWeight = 3; 
            } else if (visiting.games_played >= 1){
                lineWeight = 1;
            } else {
                lineWeight = 0; 
            }

            const connectionLine = L.polyline(
                [clickedEdgePoint, visitingEdgePoint], 
                { color: 'grey', weight: lineWeight, zIndex: 1 } 
            );

            connectionLine.addTo(map);
            connections.push({ stadium: visiting.stadium, line: connectionLine });
            
            connectionLine.bindTooltip(`${visiting.stadium} (${visiting.games_played} games played)`);
        } else {
            console.warn(`Visiting circle not found for stadium: ${visiting.stadium}`);
        }
    });
}


// Function to clear previous connections
function clearConnections() {
    connections.forEach(connection => {
        map.removeLayer(connection.line); 
    });
    connections = []; 
}


// Clear tooltips from circles
function clearCircleTooltips() {
    drawnCircles.forEach(circle => {
        circle.off('mouseover'); 
    });
}


// Show visiting stadium tooltip on hover
function showVisitingTooltip(event, visiting) {
    const tooltipContent = `
        <div class="stadium-name">${visiting.stadium}</div>
        <div class="tooltip-text">
            Team: ${visiting.opponent}<br>
            Games Played: ${visiting.games_played}<br>
            <span style="color: green;">Win</span> Rate: <span style="color: green;">${(visiting.away_win_rate * 100).toFixed(2)}%</span><br>
            <span style="color: grey;">Draw</span> Rate: <span style="color: grey;">${(visiting.away_draw_rate * 100).toFixed(2)}%</span><br>
            <span style="color: #d50032;">Loss</span> Rate: <span style="color: #d50032;">${(visiting.away_loss_rate * 100).toFixed(2)}%</span><br>
        </div>
    `;

    tooltip.html(tooltipContent)
        .style("left", `${event.originalEvent.clientX + 10}px`)
        .style("top", `${event.originalEvent.clientY - 20}px`)
        .style("opacity", 1); 
}


// Add event listeners for league buttons
const leagueButtons = document.querySelectorAll('.league-button');
leagueButtons.forEach(button => {
    button.addEventListener('click', function() {
        leagueButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        const league = this.dataset.league; 
        zoomToLeague(league); 
    });
});