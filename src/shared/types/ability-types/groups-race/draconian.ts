import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import ServerCache from "@shared/cache/server-cache";

export class Draconian implements IAbilityGroup {
  static instance: Draconian;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Draconian;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [Dodge.GetInstance()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Draconian {
    if (!Draconian.instance) {
      Draconian.instance = new Draconian();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return Draconian.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Draconian.GetInstance() as T;
  }
}

export default Draconian;
