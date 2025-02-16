import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import PanicEnemy from "@shared/types/ability-types/skills/panic-enemy";
import Waylay from "@shared/types/ability-types/skills/waylay";
import Stealth from "@shared/types/ability-types/skills/stealth";
import Peek from "@shared/types/ability-types/skills/peek";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Inspect from "@shared/types/ability-types/skills/inspect";
import Backstab from "@shared/types/ability-types/skills/backstab";
import Steal from "@shared/types/ability-types/skills/steal";
import Halt from "@shared/types/ability-types/skills/halt";
import PotionSmash from "@shared/types/ability-types/skills/potion-smash";
import Riot from "@shared/types/ability-types/skills/riot";

export class BanditDefault implements IAbilityGroup {
  static instance: BanditDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.BanditDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      new PanicEnemy(),
      new Waylay(),
      new Stealth(),
      new Peek(),
      new SecondAttack(),
      new Inspect(),
      new Backstab(),
      new Steal(),
      new Halt(),
      new PotionSmash(),
      new Riot(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BanditDefault {
    if (!BanditDefault.instance) {
      BanditDefault.instance = new BanditDefault();
    }
    return BanditDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BanditDefault.GetInstance() as T;
  }
}

export default BanditDefault;
