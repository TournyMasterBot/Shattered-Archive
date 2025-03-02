import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldCleave from "@shared/types/ability-types/skills/shield-cleave";
import Whirl from "@shared/types/ability-types/skills/whirl";
import Disembowel from "@shared/types/ability-types/skills/Disembowel";
import ServerCache from "@shared/cache/server-cache";

export class MasteryAxe implements IAbilityGroup {
  private static instance: MasteryAxe;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  // Private constructor to prevent direct instantiation
  private constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MasteryAxe;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      ShieldCleave.GetInstance(), 
      Whirl.GetInstance(), 
      Disembowel.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryAxe {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbilityGroup
  public Get<T>(): T {
    return MasteryAxe.GetInstance() as T;
  }
}

export default MasteryAxe;
