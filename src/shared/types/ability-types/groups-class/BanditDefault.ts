import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import PanicEnemy from "@shared/types/ability-types/skills/PanicEnemy";
import Waylay from "@shared/types/ability-types/skills/Waylay";
import Stealth from "@shared/types/ability-types/skills/Stealth";
import Peek from "@shared/types/ability-types/skills/Peek";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import Inspect from "@shared/types/ability-types/skills/Inspect";
import Backstab from "@shared/types/ability-types/skills/Backstab";
import Steal from "@shared/types/ability-types/skills/Steal";
import Halt from "@shared/types/ability-types/skills/Halt";
import PotionSmash from "@shared/types/ability-types/skills/PotionSmash";
import Riot from "@shared/types/ability-types/skills/Riot";
import ServerCache from "@shared/cache/server-cache";

export class BanditDefault implements IAbilityGroup {
  static instance: BanditDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BanditDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      PanicEnemy.GetInstance(),
      Waylay.GetInstance(),
      Stealth.GetInstance(),
      Peek.GetInstance(),
      SecondAttack.GetInstance(),
      Inspect.GetInstance(),
      Backstab.GetInstance(),
      Steal.GetInstance(),
      Halt.GetInstance(),
      PotionSmash.GetInstance(),
      Riot.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BanditDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BanditDefault.GetInstance() as T;
  }
}

export default BanditDefault;
