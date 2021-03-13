import {Component, OnInit} from '@angular/core';
import {HttpService, MobileNavState} from '../../http.service';
import {Subscription} from 'rxjs';
import {Chart} from 'angular-highcharts';

@Component({
    selector: 'app-avg-block-size',
    templateUrl: './avg-block-size.component.html',
    styleUrls: ['./avg-block-size.component.scss']
})
export class AvgBlockSizeComponent implements OnInit {
    navIsOpen: boolean;
    searchIsOpen: boolean;

    activeChart: string;
    period: string;
    InputArray: any;
    chartSubscription: Subscription;
    AvgBlockSizeChart: Chart;
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
                shared: true,
                valueDecimals: 0,
                xDateFormat: '%Y/%m/%d %H:%M',

                pointFormatter: function () {
                    const point = this;
                    return '<b style="color:' + point.color + '">\u25CF</b> ' + point.series.name + ': <b>' + (point.y) + '</b><br/>';
                }
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
            series: chartsData
        });
    }

    onIsVisible($event): void {
        this.searchIsOpen = $event;
    }


    constructor(private httpService: HttpService, private mobileNavState: MobileNavState) {
        this.navIsOpen = false;
        this.searchIsOpen = false;
        this.activeChart = 'AvgBlockSize';
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

                const AvgBlockSize = [];
                for (let i = 1; i < this.InputArray.length; i++) {
                    AvgBlockSize.push([this.InputArray[i].at * 1000, this.InputArray[i].bcs]);
                }
                this.AvgBlockSizeChart = AvgBlockSizeComponent.drawChart(
                    false,
                    'Average Block Size',
                    'MB',
                    this.seriesData = [
                        {type: 'area', name: 'MB', data: AvgBlockSize}
                    ]
                );

            }, err => console.log(err),
            () => {
                this.loader = false;
            }
        );
    }
}





