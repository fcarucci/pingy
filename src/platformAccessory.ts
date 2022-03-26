import { Service, PlatformAccessory } from 'homebridge';

import { PingyPlatform } from './platform';
import * as ping from 'net-ping';
import * as dns from 'dns';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PingyPlatformAccessory {

  /* eslint-disable  @typescript-eslint/no-explicit-any */
  private static session: any;
  private service: Service;

  private lastPingTimeinMS: number;

  constructor(
    private readonly platform: PingyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly target: string,
    private readonly interval: number,
  ) {
    this.lastPingTimeinMS = 0;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.getCharacteristic(platform.api.hap.Characteristic.ContactSensorState).
      onGet(this.handleContactSensorStateGet.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.Name, target);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.accessory.getService('Ping') ||
      this.accessory.addService(this.platform.Service.AccessoryRuntimeInformation, 'Ping', 'AccessoryRuntimeInformation-1');

    this.service.getCharacteristic(this.platform.Characteristic.Ping)
      .onGet(this.handlePingGet.bind(this));

    const refresh_interval = this.interval > 0 ? this.interval * 1000 : 60 * 1000;

    this.pingHost(this.target);
    setInterval(() => {
      this.pingHost(this.target);
    }, refresh_interval);
  }

  pingHost(target: string) {
    if (!PingyPlatformAccessory.session) {
      PingyPlatformAccessory.session = ping.createSession({packetSize: 64});
      if (PingyPlatformAccessory.session) {
        PingyPlatformAccessory.session.on ('error', () => {
          PingyPlatformAccessory.session!.close();
          PingyPlatformAccessory.session = null;
        });
        PingyPlatformAccessory.session.on ('close', () => {
          PingyPlatformAccessory.session = null;
        });
      }
    }

    const options = {
      family: 4,
    };

    dns.lookup(target, options, (err, address) => {
      if (!err) {
        PingyPlatformAccessory.session.pingHost (address, (error, target, sent, rcvd) => {
          const ms = rcvd - sent;
          if (error) {
            this.lastPingTimeinMS = 0;
          } else {
            this.lastPingTimeinMS = ms;
          }
        });
      } else {
        this.lastPingTimeinMS = 0;
      }
    });
  }

  handleContactSensorStateGet() {
    let value = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    if (this.lastPingTimeinMS > 0) {
      value = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }

    const msg = value === this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED ? 'CONTACT DETECTED' : 'CONTACT NOT DETECTED';

    this.platform.log.debug('Triggered GET ContactSensorState [' + this.target + ']: ' +
      msg + ' (' +
      this.lastPingTimeinMS + 'ms)');

    return value;
  }

  handlePingGet() {
    return String(this.lastPingTimeinMS);
  }
}
