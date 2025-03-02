import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";
import Flail from "@shared/types/ability-types/skills/flail";
import ServerCache from "@shared/cache/server-cache";

export class CrusaderBasics implements IAbilityGroup {
  static instance: CrusaderBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.CrusaderBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Mace.GetInstance(), 
      Flail.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): CrusaderBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CrusaderBasics.GetInstance() as T;
  }
}

export default CrusaderBasics;
