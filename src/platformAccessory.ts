import { Service, PlatformAccessory } from 'homebridge';

import { PingyPlatform } from './platform';
import * as tcpp from 'tcp-ping';
import * as dns from 'dns';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PingyPlatformAccessory {
  private service: Service;

  private lastPingTimeinMS: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private status: any;

  constructor(
    private readonly platform: PingyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly target: string,
    private readonly interval: number,
  ) {
    this.lastPingTimeinMS = -1;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, target);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.accessory.getService('Ping') ||
      this.accessory.addService(this.platform.Service.AccessoryRuntimeInformation, 'Ping', 'AccessoryRuntimeInformation-1');

    this.service.getCharacteristic(this.platform.Characteristic.Ping)
      .onGet(this.handlePingGet.bind(this));

    let refresh_interval = this.interval > 0 ? this.interval : 60;
    if (refresh_interval < 5) {
      refresh_interval = 5;
    }

    this.pingHost(this.target);
    setInterval(() => {
      this.pingHost(this.target);
    }, refresh_interval * 1000);
  }

  pingHost(target: string) {
    const options = {
      family: 4,
    };

    dns.lookup(target, options, (err, address) => {
      if (!err) {
        tcpp.ping({ address: address, timeout: 1000, attempts: 3 }, (err, data) => {
          if (!isNaN(data.avg)) {
            this.lastPingTimeinMS = data.avg;
          }
          const status = this.lastPingTimeinMS > 0 ?
            this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED:
            this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

          if (this.status !== status) {
            this.status = status;

            this.service.setCharacteristic(
              this.platform.Characteristic.ContactSensorState, this.status);

            const msg = status === this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED ?
              'CONTACT DETECTED' :
              'CONTACT NOT DETECTED';

            this.platform.log.info('Triggered SET ContactSensorState [' + this.target + ']: ' +
              msg + ' (' +
              this.lastPingTimeinMS.toFixed(1) + 'ms)');
          }
        });
      } else {
        this.lastPingTimeinMS = 0;
        this.service.setCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
      }
    });
  }

  handlePingGet() {
    return String(this.lastPingTimeinMS);
  }
}
