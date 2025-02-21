import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Bladesong from "@shared/types/ability-types/skills/bladesong";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Sword from "@shared/types/ability-types/skills/sword";

export class BladesingerBasics implements IAbilityGroup {
  static instance: BladesingerBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BladesingerBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [new Sword(), new Dagger(), new Bladesong()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BladesingerBasics {
    if (!BladesingerBasics.instance) {
      BladesingerBasics.instance = new BladesingerBasics();
    }
    return BladesingerBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BladesingerBasics.GetInstance() as T;
  }
}

export default BladesingerBasics;
