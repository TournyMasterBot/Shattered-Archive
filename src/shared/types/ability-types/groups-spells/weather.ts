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

export class Weather implements IAbilityGroup {
  static instance: Weather;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Weather;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CallLightning.GetInstance().Get(),
      FaerieFog.GetInstance().Get(),
      Magewind.GetInstance().Get(),
      ControlWeather.GetInstance().Get(),
      LightningBolt.GetInstance().Get(),
      Fog.GetInstance().Get(),
      FaerieFire.GetInstance().Get(),
      Tornado.GetInstance().Get(),
      DispelFog.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Weather {
    if (!Weather.instance) {
      Weather.instance = new Weather();
    }
    return Weather.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Weather.GetInstance() as T;
  }
}

export default Weather;
