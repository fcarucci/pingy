import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

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
  private status: CharacteristicValue;

  private static aggregateAccessory: PingyPlatformAggregateAccessory;

  static setAggregateAccessory(accessory) {
    PingyPlatformAccessory.aggregateAccessory = accessory;
  }

  constructor(
    private readonly platform: PingyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly target: string,
    private readonly interval: number,
  ) {
    this.lastPingTimeinMS = 0;
    this.status = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, target);

    this.accessory.getService('Ping') ||
      this.accessory.addService(this.platform.Service.AccessoryRuntimeInformation, 'Ping', 'AccessoryRuntimeInformation-1');

    this.service.getCharacteristic(this.platform.Characteristic.Ping)
      .onGet(this.handlePingGet.bind(this));

    let refresh_interval = this.interval > 0 ? this.interval : 60;
    if (refresh_interval < 5) {
      refresh_interval = 5;
    }

    this.service.setCharacteristic(
      this.platform.Characteristic.ContactSensorState, this.status);

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

            this.updateAggregateAccessory();
          }
        });
      } else {
        this.lastPingTimeinMS = 0;
        this.service.setCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);

        if (PingyPlatformAccessory.aggregateAccessory) {
          PingyPlatformAccessory.aggregateAccessory.update();
        }
      }
    });
  }

  private updateAggregateAccessory() {
    if (PingyPlatformAccessory.aggregateAccessory) {
      PingyPlatformAccessory.aggregateAccessory.update();
    }
  }

  handlePingGet() {
    return String(this.lastPingTimeinMS);
  }

  isConnected() {
    return this.status === this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  }
}

export class PingyPlatformAggregateAccessory {
  private service: Service;
  private status: CharacteristicValue;

  constructor(
    private readonly platform: PingyPlatform,
    private readonly name: string,
    private readonly accessory: PlatformAccessory,
    private readonly accessories: Set<PingyPlatformAccessory>,
  ) {
    this.status = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, name);
    this.service.setCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }

  public update() {
    let status = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    for (const accessory of this.accessories) {
      if (!accessory.isConnected()) {
        status = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      }
    }

    if (this.status !== status) {
      this.status = status;
      const msg = this.status === this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED ?
        'CONTACT DETECTED' :
        'CONTACT NOT DETECTED';

      this.platform.log.info('Update aggregate Ping ContactSensorState: ' + msg);

      this.service.setCharacteristic(
        this.platform.Characteristic.ContactSensorState, this.status);
    }
  }
}
