import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import GiantStrength from "@shared/types/ability-types/spells/GiantStrength";
import Refresh from "@shared/types/ability-types/spells/Refresh";
import Haste from "@shared/types/ability-types/spells/haste";
import WaterBreathing from "@shared/types/ability-types/spells/WaterBreathing";
import Infravision from "@shared/types/ability-types/spells/Infravision";
import LightFoot from "@shared/types/ability-types/spells/LightFoot";
import ServerCache from "@shared/cache/server-cache";

export class Enhancement implements IAbilityGroup {
  static instance: Enhancement;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Enhancement;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      GiantStrength.GetInstance(),
      Refresh.GetInstance(),
      Haste.GetInstance(),
      WaterBreathing.GetInstance(),
      Infravision.GetInstance(),
      LightFoot.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Enhancement {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Enhancement.GetInstance() as T;
  }
}

export default Enhancement;
