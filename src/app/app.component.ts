import {Component, OnInit, OnDestroy} from '@angular/core';
import {Router, Event, NavigationEnd} from '@angular/router';
import {MobileNavState} from './http.service';
import {Subscription} from 'rxjs';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    providers: [],
})
export class AppComponent implements OnInit, OnDestroy {
    navIsOpen: boolean;
    subscription: Subscription;
    subscription1: Subscription;

    constructor(
        private router: Router,
        private mobileNavState: MobileNavState) {
        this.navIsOpen = false;
        const screenWidth = window.screen.width;
        if (screenWidth <= 761) {
            this.navIsOpen = true;
        }
        this.subscription1 = router.events.subscribe((event: Event) => {
            if (event instanceof NavigationEnd) {
                if (this.navIsOpen === true) {
                    this.mobileNavState.toggleMenu();
                }
            }
        });
    }

    ngOnInit() {
        this.subscription = this.mobileNavState.change.subscribe(navIsOpen => {
            this.navIsOpen = navIsOpen;
        });
    }

    btnToggleMenu() {
        this.mobileNavState.toggleMenu();
    }

    ngOnDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        if (this.subscription1) {
            this.subscription1.unsubscribe();
        }
    }

}
