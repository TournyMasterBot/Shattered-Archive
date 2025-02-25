import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Axe from "@shared/types/ability-types/skills/axe";
import Mace from "@shared/types/ability-types/skills/mace";
import Sword from "@shared/types/ability-types/skills/sword";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Polearm from "@shared/types/ability-types/skills/polearm";
import Whip from "@shared/types/ability-types/skills/whip";
import Flail from "@shared/types/ability-types/skills/flail";
import Spear from "@shared/types/ability-types/skills/spear";
import Staff from "@shared/types/ability-types/skills/staff";

export class Weaponsmaster implements IAbilityGroup {
  static instance: Weaponsmaster;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Weaponsmaster;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Axe.GetInstance(),
      Mace.GetInstance(),
      Sword.GetInstance(),
      Dagger.GetInstance(),
      Polearm.GetInstance(),
      Whip.GetInstance(),
      Flail.GetInstance(),
      Spear.GetInstance(),
      Staff.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Weaponsmaster {
    if (!Weaponsmaster.instance) {
      Weaponsmaster.instance = new Weaponsmaster();
    }
    return Weaponsmaster.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Weaponsmaster.GetInstance() as T;
  }
}

export default Weaponsmaster;
