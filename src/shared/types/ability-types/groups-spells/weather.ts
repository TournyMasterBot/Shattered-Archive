import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CallLightning from "@shared/types/ability-types/spells/call-lightning";
import FaerieFog from "@shared/types/ability-types/spells/faerie-fog";
import Magewind from "@shared/types/ability-types/spells/magewind";
import ControlWeather from "@shared/types/ability-types/spells/control-weather";
import LightningBolt from "@shared/types/ability-types/spells/lightning-bolt";
import Fog from "@shared/types/ability-types/spells/fog";
import FaerieFire from "@shared/types/ability-types/spells/faerie-flames";
import Tornado from "@shared/types/ability-types/spells/tornado";
import DispelFog from "@shared/types/ability-types/spells/dispel-fog";
import ServerCache from "@shared/cache/server-cache";

export class Weather implements IAbilityGroup {
  static instance: Weather;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Weather;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CallLightning.GetInstance(),
      FaerieFog.GetInstance(),
      Magewind.GetInstance(),
      ControlWeather.GetInstance(),
      LightningBolt.GetInstance(),
      Fog.GetInstance(),
      FaerieFire.GetInstance(),
      Tornado.GetInstance(),
      DispelFog.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Weather {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Weather.GetInstance() as T;
  }
}

export default Weather;
