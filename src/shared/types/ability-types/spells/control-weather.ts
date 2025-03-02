import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ControlWeather implements IAbility {
  private static instance: ControlWeather;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Control Weather'
'CONTROL WEATHER'
'CONTROL WEATHER'

Syntax: cast 'control weather' better
        cast 'control weather' worse

This spell makes the weather either better or worse.  Changes in weather,
being the domain of the goddess Turpa, are difficult to achieve, and tend to
take a great deal of effort.  

See also - WEATHER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ControlWeather.instance === undefined) {
      ControlWeather.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ControlWeather {
    if (!ControlWeather.instance) {
      ControlWeather.instance = new ControlWeather();
    }
    return ControlWeather.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ControlWeather.GetInstance() as T;
  }
}

export default ControlWeather;
