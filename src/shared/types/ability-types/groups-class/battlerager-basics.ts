import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Axe from "@shared/types/ability-types/skills/axe";
import KillingRage from "@shared/types/ability-types/skills/killing-rage";
import Mace from "@shared/types/ability-types/skills/mace";

export class BattleragerBasics implements IAbilityGroup {
  static instance: BattleragerBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BattleragerBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [new Axe(), new KillingRage(), new Mace()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BattleragerBasics {
    if (!BattleragerBasics.instance) {
      BattleragerBasics.instance = new BattleragerBasics();
    }
    return BattleragerBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BattleragerBasics.GetInstance() as T;
  }
}

export default BattleragerBasics;
