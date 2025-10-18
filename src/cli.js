import { Command } from 'commander';
import {
    offerCommand,
    autoOfferCommand,
    checkOffersCommand,
    scanCommand,
    trendingCommand,
    listCommand,
    swapCommand,
    sendCommand,
    keyCommand,
    balanceCommand,
    chainCommand
} from './commands/index.js';

const program = new Command();

program
    .name('opensea-offer-maker')
    .description('OpenSea offer creation tool')
    .version('1.0.0')
    .addCommand(offerCommand)
    .addCommand(autoOfferCommand)
    .addCommand(checkOffersCommand)
    .addCommand(scanCommand)
    .addCommand(trendingCommand)
    .addCommand(listCommand)
    .addCommand(swapCommand)
    .addCommand(sendCommand)
    .addCommand(keyCommand)
    .addCommand(balanceCommand)
    .addCommand(chainCommand);

program.parse(process.argv); 