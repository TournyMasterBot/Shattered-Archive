import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EnhancedReactions from "@shared/types/ability-types/skills/enhanced-reactions";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import Grip from "@shared/types/ability-types/skills/grip";
import Parry from "@shared/types/ability-types/skills/parry";
import Weaponsmaster from "../groups-skills/Weaponsmaster";
import MasterySword from "../groups-skills/MasterySword";
import ServerCache from "@shared/cache/server-cache";

export class ArmsmanDefault implements IAbilityGroup {
  private static instance: ArmsmanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ArmsmanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Weaponsmaster.GetInstance().abilities,
      ...MasterySword.GetInstance().abilities,
      EnhancedReactions.GetInstance(),
      DualWield.GetInstance(),
      Grip.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ArmsmanDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ArmsmanDefault.GetInstance() as T;
  }
}

export default ArmsmanDefault;
