import {Component, OnInit} from '@angular/core';
import {HttpService, MobileNavState} from '../../http.service';
import {Chart} from 'angular-highcharts';
import {Subscription} from 'rxjs';

@Component({
    selector: 'app-hashrate',
    templateUrl: './hashrate.component.html',
    styleUrls: ['./hashrate.component.scss']
})
export class HashrateComponent implements OnInit {
    navIsOpen: boolean;
    searchIsOpen: boolean;

    activeChart: string;
    period: string;
    InputArray: any;
    chartSubscription: Subscription;
    hashRateChart: Chart;
    seriesData: any;
    loader: boolean;

    static drawChart(activeChart, titleText, yText, chartsData): Chart {
        return new Chart({
            chart: {
                type: 'line',
                backgroundColor: 'transparent',
                height: 700,
                // width: null,
                zoomType: 'x',
                animation: false,
                ignoreHiddenSeries: true,
                resetZoomButton: {
                    theme: {
                        display: 'none',
                    },
                },
            },
            responsive: {
                rules: [{
                    condition: {
                        maxWidth: 500,
                    },
                    height: 500,
                    chartOptions: {
                        title: {
                            margin: 50
                        },
                        rangeSelector: {
                            enabled: false,
                            inputEnabled: false,
                        },
                        yAxis: {
                            labels: {
                                align: 'left',
                                x: 0,
                                y: -5
                            },
                        },
                    }
                }]
            },
            boost: {
                enabled: true,
                useGPUTranslations: true,
                usePreallocated: true,
                // seriesThreshold: 1,
            },
            title: {
                text: titleText,
                style: {
                    color: '#5d6c78',
                    fontSize: '18px',
                }
            },
            credits: {enabled: false},
            exporting: {enabled: false},
            legend: {
                enabled: true,
                itemStyle: {
                    color: '#5d6c78',
                    fontFamily: 'Helvetica',
                },
                itemHoverStyle: {
                    color: '#5d6c78'
                }
            },
            tooltip: {
                enabled: true,
                valueDecimals: 0,
                xDateFormat: '%Y/%m/%d %H:%M',

                pointFormatter: function () {
                    const point = this;
                    return '<b style="color:' + point.color + '">\u25CF</b> ' + point.series.name + ': <b>' + (point.y) + '</b><br/>';
                },
                shared: true,
                crosshairs: true,
            },
            plotOptions: {
                area: {
                    fillColor: {
                        linearGradient: {
                            x1: 0,
                            y1: 0,
                            x2: 0,
                            y2: 1
                        },
                        stops: []
                    },
                    marker: {
                        radius: 2
                    },
                    lineWidth: 2,
                    states: {
                        hover: {
                            lineWidth: 1
                        }
                    },
                    threshold: null
                }
            },
            xAxis: {
                type: 'datetime',
                labels: {
                    style: {
                        color: '#5d6c78',
                        fontSize: '11px'
                    },
                    format: '{value:%d.%b}'
                },
            },
            yAxis: {
                floor: 0,
                title: {
                    text: yText,
                    style: {
                        color: '#5d6c78'
                    }
                },
                labels: {
                    style: {
                        color: '#5d6c78',
                        fontSize: '11px'
                    },
                },
            },
            navigator: {enabled: true},
            rangeSelector: {
                height: 60,
                enabled: true,
                allButtonsEnabled: true,
                buttons: [{
                    type: 'day',
                    count: 1,
                    text: 'day'
                }, {
                    type: 'week',
                    count: 1,
                    text: 'week'
                }, {
                    type: 'month',
                    count: 1,
                    text: 'month'
                }, {
                    type: 'month',
                    count: 3,
                    text: 'quarter'
                }, {
                    type: 'year',
                    count: 1,
                    text: 'year'
                }, {
                    type: 'all',
                    text: 'all'
                }],
                selected: 1,
                labelStyle: {
                    color: '#5d6c78',
                },
              inputStyle: {
                color: '#5d6c78',
                backgroundColor: '#74838e',
              },
              inputBoxBorderColor: '#74838e',
                inputBoxWidth: 120,
                inputBoxHeight: 16,

                buttonTheme: {
                    width: 60,
                    fill: '#fff',
                    stroke: '#e1e8eb',
                    'stroke-width': 1,
                    color: '#5d6c78',
                    opacity: 0.6,
                    r: 5,
                    style: {
                        color: '#5d6c78',
                        fontSize: '14px',
                        fontFamily: 'Helvetica',
                        fontWeight: '300',
                        opacity: 0.6,
                    },
                    states: {
                        hover: {
                            fill: '#74838e',
                            stroke: '#fff',
                            'stroke-width': 1,
                            style: {
                                color: '#fff',
                                fill: '#74838e',
                                opacity: 1,
                                fontWeight: 400,
                            }
                        },
                        select: {
                            fill: '#74838e',
                            stroke: '#fff',
                            'stroke-width': 1,
                            style: {
                                color: '#fff',
                                fill: '#74838e',
                                opacity: 1,
                                fontWeight: 400,
                            }
                        },
                        disabled: {
                            style: {
                                color: '#fff',
                                opacity: 0.5,
                                fontWeight: 400,
                                cursor: 'default',
                            }
                        }
                    }
                },
            },
            series: chartsData,
        });
    }


    onIsVisible($event): void {
        this.searchIsOpen = $event;
    }

    constructor(private httpService: HttpService, private mobileNavState: MobileNavState) {
        this.navIsOpen = false;
        this.searchIsOpen = false;

        this.activeChart = 'hashRate';
        this.period = 'all';
    }

    ngOnInit() {
        this.mobileNavState.change.subscribe(navIsOpen => {
            this.navIsOpen = navIsOpen;
        });
        this.initialChart();
    }

    initialChart() {
        this.loader = true;
        if (this.chartSubscription) {
            this.chartSubscription.unsubscribe();
        }
        this.chartSubscription = this.httpService.getChart(this.activeChart, this.period).subscribe(data => {
            this.InputArray = data;

            // const difficultyArray = [];
            const hashRate100 = [];
            // const hashRate400 = [];
            for (let i = 1; i < this.InputArray.length; i++) {
                hashRate100.push([this.InputArray[i].at * 1000, parseInt(this.InputArray[i].h100, 10)]);
                // hashRate400.push([this.InputArray[i].at * 1000, parseInt(this.InputArray[i].h400, 10)]);
                // difficultyArray.push([this.InputArray[i].at * 1000, parseInt(this.InputArray[i].d120, 10)]);
            }
            this.hashRateChart = HashrateComponent.drawChart(
                false,
                'Hash Rate',
                'Hash Rate H/s',
                this.seriesData = [
                    {type: 'area', name: 'Hash Rate', data: hashRate100},
                    // {type: 'area', name: 'Difficulty', data: difficultyArray, color: '#e06a6a'}
                ]
            );
        }, err => console.log(err), () => {
            this.loader = false
        });
    }
}



